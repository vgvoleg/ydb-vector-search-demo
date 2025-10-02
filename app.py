from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import os
import logging
import time

# Загружаем переменные окружения
load_dotenv()

# Импортируем компоненты для векторного хранилища
from langchain_community.embeddings.yandex import YandexGPTEmbeddings
from langchain_ydb.vectorstores import YDB, YDBSettings

# Импортируем компоненты для YandexGPT
from langchain_community.llms import YandexGPT

app = Flask(__name__)

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Инициализация векторного хранилища
def init_vector_store():
    try:
        import ydb.iam
        yc_folder_id = os.getenv('YC_FOLDER_ID')
        embeddings = YandexGPTEmbeddings(folder_id=yc_folder_id)

        vector_store = YDB(
            embeddings,
            config=YDBSettings(
                host=os.getenv('YDB_HOST'),
                port=int(os.getenv('YDB_PORT')),
                database=os.getenv('YDB_DATABASE'),
                secure=bool(os.getenv('YDB_SECURE')),
                table="langchain_ydb_market",
                index_enabled=False,
            ),
            credentials=ydb.iam.MetadataUrlCredentials(),
        )
        logger.info("Vector store initialized successfully")
        return vector_store
    except Exception as e:
        logger.error(f"Error initializing vector store: {e}")
        return None

# Инициализация YandexGPT
def init_yandex_gpt():
    try:
        yc_folder_id = os.getenv('YC_FOLDER_ID')
        yandex_gpt = YandexGPT(
            folder_id=yc_folder_id,
            model_name="yandexgpt-lite",
            temperature=0.3,
            max_tokens=2000
        )
        logger.info("YandexGPT initialized successfully")
        return yandex_gpt
    except Exception as e:
        logger.error(f"Error initializing YandexGPT: {e}")
        return None

# Глобальные переменные
vector_store = init_vector_store()
yandex_gpt = init_yandex_gpt()

@app.route('/')
def index():
    """Главная страница с интерфейсом поиска"""
    return render_template('index.html')

def generate_summary(query, documents):
    """Генерация саммари с помощью YandexGPT"""
    try:
        if not yandex_gpt or not documents:
            logger.info("YandexGPT or documents not available for summary generation")
            return None

        # Объединяем содержимое документов
        context = "\n\n".join([doc.page_content for doc in documents[:3]])  # Берем только первые 3 документа
        logger.info(f"Generating summary for {len(documents[:3])} documents, context length: {len(context)} chars")

        # Создаем промпт для генерации саммари
        prompt = f"""На основе следующих документов ответь на вопрос: "{query}"

Документы:
{context}

Дай краткий и информативный ответ на русском языке, основываясь только на предоставленной информации. Если информации недостаточно для ответа, укажи это."""

        # Генерируем ответ
        logger.info("Sending request to YandexGPT...")
        response = yandex_gpt.invoke(prompt)
        logger.info(f"YandexGPT response received, length: {len(response)} chars")
        return response.strip()

    except Exception as e:
        logger.error(f"Summary generation error: {e}")
        return None

@app.route('/search', methods=['POST'])
def search():
    """API endpoint для поиска по векторному хранилищу с RAG"""
    try:
        data = request.get_json()
        query = data.get('query', '').strip()

        if not query:
            return jsonify({'error': 'Запрос не может быть пустым'}), 400

        if not vector_store:
            return jsonify({'error': 'Векторное хранилище недоступно'}), 500

        # Генерируем эмбеддинги для запроса
        embedding_start_time = time.time()
        query_embedding = vector_store.embeddings.embed_query(query)
        embedding_end_time = time.time()
        embedding_duration = embedding_end_time - embedding_start_time

        # Выполняем поиск по сходству с оценками используя готовый вектор
        search_start_time = time.time()
        results = vector_store.similarity_search_by_vector_with_score(query_embedding, k=5)
        search_end_time = time.time()
        search_duration = search_end_time - search_start_time

        # Форматируем результаты
        formatted_results = []
        for i, (doc, score) in enumerate(results, 1):
            metadata = doc.metadata if hasattr(doc, 'metadata') else {}
            logger.info(f"Document {i} metadata: {metadata}, score: {score}")
            formatted_results.append({
                'id': i,
                'content': doc.page_content,
                'metadata': metadata,
                'score': float(score)  # Преобразуем в float для JSON
            })

        # Генерируем саммари с помощью YandexGPT
        summary = None
        gpt_duration = 0
        if results:
            # Извлекаем только документы для саммари (без score)
            docs_only = [doc for doc, score in results]
            gpt_start_time = time.time()
            summary = generate_summary(query, docs_only)
            gpt_end_time = time.time()
            gpt_duration = gpt_end_time - gpt_start_time

        # Логируем время выполнения
        total_time = embedding_duration + search_duration + gpt_duration
        logger.info(f"Search performance - Query: '{query}' | Embeddings: {embedding_duration:.3f}s | Vector search: {search_duration:.3f}s | YandexGPT: {gpt_duration:.3f}s | Total: {total_time:.3f}s")

        return jsonify({
            'success': True,
            'query': query,
            'results': formatted_results,
            'count': len(formatted_results),
            'summary': summary,
            'performance': {
                'embedding_time': round(embedding_duration, 3),
                'search_time': round(search_duration, 3),
                'gpt_time': round(gpt_duration, 3),
                'total_time': round(total_time, 3)
            }
        })

    except Exception as e:
        logger.error(f"Search error: {e}")
        return jsonify({'error': f'Ошибка поиска: {str(e)}'}), 500

@app.route('/health')
def health():
    """Проверка состояния приложения"""
    return jsonify({
        'status': 'healthy',
        'vector_store_available': vector_store is not None,
        'yandex_gpt_available': yandex_gpt is not None
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)