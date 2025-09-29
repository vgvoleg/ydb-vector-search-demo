// Основной класс для управления поиском
class SearchApp {
    constructor() {
        this.searchInput = document.getElementById('searchInput');
        this.searchButton = document.getElementById('searchButton');
        this.loadingSpinner = document.getElementById('loadingSpinner');
        this.resultsContainer = document.getElementById('resultsContainer');
        this.resultsList = document.getElementById('resultsList');
        this.resultsCount = document.getElementById('resultsCount');
        this.summarySection = document.getElementById('summarySection');
        this.summaryContent = document.getElementById('summaryContent');
        this.noResults = document.getElementById('noResults');
        this.errorMessage = document.getElementById('errorMessage');
        this.errorText = document.getElementById('errorText');
        this.shareButton = document.getElementById('shareButton');
        this.shareNotification = document.getElementById('shareNotification');

        this.isSearching = false;

        this.initEventListeners();
    }

    initEventListeners() {
        // Обработчик клика по кнопке поиска
        this.searchButton.addEventListener('click', () => {
            this.performSearch();
        });

        // Обработчик нажатия Enter в поле ввода
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });

        // Убираем автоматическую очистку при вводе текста
        // this.searchInput.addEventListener('input', () => {
        //     this.clearResults();
        // });

        // Обработчик изменения URL (кнопка назад/вперед)
        window.addEventListener('popstate', (e) => {
            this.loadFromUrl();
        });

        // Обработчик кнопки "Поделиться"
        this.shareButton.addEventListener('click', () => {
            this.shareCurrentSearch();
        });

        // Загружаем запрос из URL при загрузке страницы
        this.loadFromUrl();

        // Фокус на поле ввода при загрузке страницы
        this.searchInput.focus();
    }

    async performSearch(queryFromUrl = null) {
        const query = queryFromUrl || this.searchInput.value.trim();

        if (!query) {
            this.showError('Пожалуйста, введите запрос для поиска');
            return;
        }

        if (this.isSearching) {
            return;
        }

        // Обновляем поле ввода, если запрос пришел из URL
        if (queryFromUrl) {
            this.searchInput.value = query;
        }

        // Обновляем URL с запросом
        this.updateUrl(query);

        this.isSearching = true;
        this.showLoading();
        this.disableSearch();

        try {
            const response = await fetch('/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: query })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Произошла ошибка при поиске');
            }

            if (data.success) {
                this.displayResults(data);
                // Показываем кнопку "Поделиться" после успешного поиска
                this.shareButton.classList.remove('hidden');
            } else {
                throw new Error(data.error || 'Неизвестная ошибка');
            }

        } catch (error) {
            console.error('Search error:', error);
            this.showError(error.message);
        } finally {
            this.isSearching = false;
            this.hideLoading();
            this.enableSearch();
        }
    }

    showLoading() {
        this.hideAllSections();
        this.loadingSpinner.classList.remove('hidden');
    }

    hideLoading() {
        this.loadingSpinner.classList.add('hidden');
    }

    displayResults(data) {
        this.hideAllSections();

        if (data.results.length === 0) {
            this.noResults.classList.remove('hidden');
            return;
        }

        // Отображаем саммари, если есть
        if (data.summary) {
            this.displaySummary(data.summary);
        }

        // Отображаем результаты поиска
        this.resultsCount.textContent = data.results.length;
        this.resultsList.innerHTML = '';

        data.results.forEach((result, index) => {
            const resultElement = this.createResultElement(result, index + 1);
            this.resultsList.appendChild(resultElement);
        });

        this.resultsContainer.classList.remove('hidden');

        // Плавная прокрутка к результатам
        this.resultsContainer.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }

    displaySummary(summary) {
        this.summaryContent.innerHTML = this.formatSummary(summary);
        this.summarySection.classList.remove('hidden');

        // Анимация появления саммари
        setTimeout(() => {
            this.summarySection.style.opacity = '0';
            this.summarySection.style.transform = 'translateY(20px)';
            this.summarySection.style.transition = 'all 0.5s ease';

            requestAnimationFrame(() => {
                this.summarySection.style.opacity = '1';
                this.summarySection.style.transform = 'translateY(0)';
            });
        }, 100);
    }

    formatSummary(summary) {
        // Экранирование HTML
        const escapeHtml = (unsafe) => {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        // Экранируем HTML
        const escapedText = escapeHtml(summary);

        // Разбиваем на параграфы по двойным переносам
        const paragraphs = escapedText.split('\n\n').filter(p => p.trim());

        // Форматируем каждый параграф, заменяя одиночные переносы на <br>
        const formattedParagraphs = paragraphs.map(p => {
            const formattedP = p.trim().replace(/\n/g, '<br>');
            return `<p>${formattedP}</p>`;
        });

        return formattedParagraphs.join('');
    }

    createResultElement(result, number) {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'result-item';

        // Отладочная информация
        console.log(`Document ${number} metadata:`, result.metadata);

        // Генерируем ссылку на источник, если есть source в метаданных
        const sourceLink = this.generateSourceLink(result.metadata);
        console.log(`Generated source link for document ${number}:`, sourceLink);

        // Генерируем хлебные крошки из заголовков
        const breadcrumbs = this.generateBreadcrumbs(result.metadata, sourceLink);

        resultDiv.innerHTML = `
            <div class="result-top">
                ${breadcrumbs ? `
                    <div class="result-breadcrumbs">
                        ${breadcrumbs}
                    </div>
                ` : ''}
                ${result.score !== undefined ? `
                    <div class="result-score" title="Оценка релевантности (чем меньше, тем лучше)">
                        <i class="fas fa-chart-line"></i>
                        <span class="score-value">${this.formatScore(result.score)}</span>
                    </div>
                ` : ''}
            </div>
            <div class="result-content">
                ${this.formatText(this.truncateText(result.content, 300))}
            </div>
        `;

        // Анимация появления
        setTimeout(() => {
            resultDiv.style.opacity = '0';
            resultDiv.style.transform = 'translateY(20px)';
            resultDiv.style.transition = 'all 0.3s ease';

            requestAnimationFrame(() => {
                resultDiv.style.opacity = '1';
                resultDiv.style.transform = 'translateY(0)';
            });
        }, number * 100);

        return resultDiv;
    }

    formatText(text) {
        // Экранирование HTML
        const escapeHtml = (unsafe) => {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        // Экранируем HTML и заменяем переносы строк на <br>
        const escapedText = escapeHtml(text);

        // Заменяем одиночные \n на <br>, двойные \n\n на параграфы
        const formattedText = escapedText
            .replace(/\n\n+/g, '</p><p>')  // Двойные переносы = новый параграф
            .replace(/\n/g, '<br>');       // Одиночные переносы = <br>

        // Оборачиваем в параграф, если есть двойные переносы
        if (formattedText.includes('</p><p>')) {
            return `<p>${formattedText}</p>`;
        }

        return formattedText;
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) {
            return text;
        }

        // Обрезаем по словам, чтобы не разрывать слова
        const truncated = text.substring(0, maxLength);
        const lastSpaceIndex = truncated.lastIndexOf(' ');

        if (lastSpaceIndex > maxLength * 0.8) {
            return truncated.substring(0, lastSpaceIndex) + '...';
        }

        return truncated + '...';
    }

    formatScore(score) {
        // Форматируем score для отображения
        if (score < 0.001) {
            return score.toExponential(2);
        } else if (score < 1) {
            return score.toFixed(3);
        } else {
            return score.toFixed(2);
        }
    }

    generateBreadcrumbs(metadata, sourceLink) {
        if (!metadata) {
            return null;
        }

        const breadcrumbParts = [];

        // Добавляем заголовки в порядке h1 -> h2 -> h3
        if (metadata.h1) {
            breadcrumbParts.push(metadata.h1);
        }
        if (metadata.h2) {
            breadcrumbParts.push(metadata.h2);
        }
        if (metadata.h3) {
            breadcrumbParts.push(metadata.h3);
        }

        if (breadcrumbParts.length === 0) {
            // Если нет заголовков, показываем обычную ссылку
            return sourceLink ? `
                <a href="${sourceLink}" target="_blank" class="source-link-main" title="Открыть источник">
                    <i class="fas fa-external-link-alt"></i>
                    Открыть источник
                </a>
            ` : null;
        }

        // Создаем хлебные крошки
        const breadcrumbsHtml = breadcrumbParts
            .map((part, index) => {
                const isLast = index === breadcrumbParts.length - 1;
                const className = `breadcrumb-item breadcrumb-h${index + 1}`;

                if (sourceLink && isLast) {
                    // Последний элемент делаем ссылкой
                    return `<a href="${sourceLink}" target="_blank" class="${className} breadcrumb-link" title="Открыть источник">
                        ${this.escapeHtml(part)}
                        <i class="fas fa-external-link-alt"></i>
                    </a>`;
                } else {
                    return `<span class="${className}">${this.escapeHtml(part)}</span>`;
                }
            })
            .join('<i class="fas fa-chevron-right breadcrumb-separator"></i>');

        return breadcrumbsHtml;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    generateSourceLink(metadata) {
        if (!metadata || !metadata.source_path) {
            console.log('No metadata or source_path field');
            return null;
        }

        const source = metadata.source_path;

        if (!source) {
            console.log('Source is empty');
            return null;
        }

        // Формируем ссылку на Яндекс.Маркет
        return `https://yandex.ru/support/market/ru/${source}`;
    }

    showError(message) {
        this.hideAllSections();
        this.errorText.textContent = message;
        this.errorMessage.classList.remove('hidden');
    }

    hideAllSections() {
        this.loadingSpinner.classList.add('hidden');
        this.resultsContainer.classList.add('hidden');
        this.summarySection.classList.add('hidden');
        this.noResults.classList.add('hidden');
        this.errorMessage.classList.add('hidden');
    }

    clearResults() {
        this.hideAllSections();
    }

    updateUrl(query) {
        // Обновляем URL с запросом
        const url = new URL(window.location);
        if (query) {
            url.searchParams.set('q', query);
        } else {
            url.searchParams.delete('q');
        }

        // Используем pushState чтобы не перезагружать страницу
        window.history.pushState({ query }, '', url);
    }

    loadFromUrl() {
        // Загружаем запрос из URL параметров
        const urlParams = new URLSearchParams(window.location.search);
        const query = urlParams.get('q');

        if (query) {
            // Выполняем поиск с запросом из URL
            this.performSearch(query);
        }
    }

    getShareableUrl(query) {
        // Генерируем ссылку для шаринга
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set('q', query);
        return url.toString();
    }

    async shareCurrentSearch() {
        const query = this.searchInput.value.trim();
        if (!query) return;

        const shareUrl = this.getShareableUrl(query);

        try {
            // Пробуем использовать современный API для копирования
            await navigator.clipboard.writeText(shareUrl);
            this.showShareNotification();
        } catch (err) {
            // Fallback для старых браузеров
            this.fallbackCopyToClipboard(shareUrl);
        }
    }

    fallbackCopyToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            document.execCommand('copy');
            this.showShareNotification();
        } catch (err) {
            console.error('Не удалось скопировать ссылку:', err);
        }

        document.body.removeChild(textArea);
    }

    showShareNotification() {
        this.shareNotification.classList.remove('hidden');
        setTimeout(() => {
            this.shareNotification.classList.add('hidden');
        }, 2000);
    }

    disableSearch() {
        this.searchButton.disabled = true;
        this.searchInput.disabled = true;
        this.searchButton.innerHTML = `
            <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
            <span>Поиск...</span>
        `;
    }

    enableSearch() {
        this.searchButton.disabled = false;
        this.searchInput.disabled = false;
        this.searchButton.innerHTML = `
            <i class="fas fa-search"></i>
            <span>Поиск</span>
        `;
    }
}

// Утилитарные функции
const utils = {
    // Debounce функция для оптимизации поиска
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Проверка доступности API
    async checkApiHealth() {
        try {
            const response = await fetch('/health');
            const data = await response.json();
            return data.status === 'healthy' && data.vector_store_available;
        } catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }
};

// Инициализация приложения при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    const app = new SearchApp();

    // Проверка состояния API при загрузке
    utils.checkApiHealth().then(isHealthy => {
        if (!isHealthy) {
            console.warn('API или векторное хранилище недоступны');
        }
    });

    // Добавление глобальных обработчиков ошибок
    window.addEventListener('error', (e) => {
        console.error('Global error:', e.error);
    });

    window.addEventListener('unhandledrejection', (e) => {
        console.error('Unhandled promise rejection:', e.reason);
    });
});

// Экспорт для возможного использования в других скриптах
window.SearchApp = SearchApp;
window.utils = utils;
