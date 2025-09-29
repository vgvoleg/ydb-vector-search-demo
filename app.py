from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import os
import logging

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
            credentials={
                "token": os.getenv('YDB_TOKEN')
            },
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
            return None

        # Объединяем содержимое документов
        context = "\n\n".join([doc.page_content for doc in documents[:3]])  # Берем только первые 3 документа

        # Создаем промпт для генерации саммари
        prompt = f"""На основе следующих документов ответь на вопрос: "{query}"

Документы:
{context}

Дай краткий и информативный ответ на русском языке, основываясь только на предоставленной информации. Если информации недостаточно для ответа, укажи это."""

        # Генерируем ответ
        response = yandex_gpt.invoke(prompt)
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

        # Выполняем поиск по сходству с оценками
        results = vector_store.similarity_search_with_score(query, k=5)

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
        if results:
            # Извлекаем только документы для саммари (без score)
            docs_only = [doc for doc, score in results]
            summary = generate_summary(query, docs_only)

        return jsonify({
            'success': True,
            'query': query,
            'results': formatted_results,
            'count': len(formatted_results),
            'summary': summary
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