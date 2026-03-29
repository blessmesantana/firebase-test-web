import { markNewBadgeSeen, shouldShowNewBadge } from './new-badges.js';

const NEW_BADGE_VERSIONS = new Map([
    ['v1.9.5.2', 'whats_new_v1.9.5.2'],
]);

const WHATS_NEW_SECTIONS = [
    {
        version: 'v1.9.5.2',
        items: [
            {
                title: 'Обновлены иконки',
                text: 'Улучшена читаемость иконок приложения, некоторые из них были переработаны полностью.',
            },
            
        ],
    },
    {
        version: 'v1.9.5.1',
        items: [
            {
                title: 'Обновлены уведомления',
                text: 'Обычные уведомления обновлены и приведены к более аккуратному виду.',
            },
            {
                title: 'Упрощены сообщения при загрузке данных',
                text: 'Сообщения о загрузке списков, дублях и конфликтах передач стали короче и понятнее.',
            },
            {
                title: 'Обновлен список курьеров',
                text: 'Полностью отсканированные курьеры теперь автоматически уходят вниз списка.',
            },
        ],
    },
    {
        version: 'v1.9.5.0',
        items: [
            {
                title: 'Добавлена справка',
                text: 'В настройках появился новый раздел с понятными пояснениями по основным вкладкам приложения.',
            },
            {
                title: 'Улучшены ошибки на экране "Данные"',
                text: 'Если в списке нет названия или передач, приложение теперь показывает понятное уведомление прямо на экране загрузки.',
            },
            {
                title: 'Обновлены сообщения о ненайденных передачах',
                text: 'Уведомления для ненайденных передач стали короче и понятнее для длинного и короткого номера.',
            },
            {
                title: 'Исправлена анимация нижнего меню',
                text: 'Анимация нижнего бара теперь корректно работает на всех темах приложения.',
            },
        ],
    },
    {
        version: 'v1.9.4.3',
        items: [
            {
                title: 'Добавлен экран "Настройки темы"',
                text: 'Тема приложения и цвет кнопок перенесены в отдельный раздел, чтобы главный экран настроек стал чище и удобнее.',
            },
            {
                title: 'Добавлена кнопка "По умолчанию"',
                text: 'В разделе "Настройки темы" теперь можно одним нажатием вернуть стандартные настройки темы и цвета кнопок.',
            },
            {
                title: 'Улучшено переключение цветов кнопок',
                text: 'Для выбора цвета кнопок добавлена анимация переключения, как в блоке выбора темы приложения.',
            },
            {
                title: 'Обновлена навигация в настройках',
                text: 'На внутренних экранах настроек кнопка "Назад к настройкам" заменена на стрелку вверху слева. Повторное нажатие на "Настройки" в нижнем меню возвращает на главный экран настроек.',
            },
            {
                title: 'Добавлено удаление одной передачи',
                text: 'Во вкладке "Курьеры" теперь можно удалить только одну выбранную передачу у курьера, не затрагивая остальные.',
            },
            {
                title: 'Добавлено время сканирования передач',
                text: 'Во вкладке "Курьеры" у отсканированных передач теперь показываются дата и время сканирования прямо в списке.',
            },
            {
                title: 'Обновлен счетчик передач',
                text: 'В списке курьеров теперь показывается не только общее количество передач, но и число уже отсканированных в формате "отсканировано/всего".',
            },
            {
                title: 'Улучшен порядок отсканированных передач',
                text: 'Отсканированные передачи теперь сортируются по времени сканирования. Последняя отсканированная передача показывается выше остальных.',
            },
            {
                title: 'Улучшена проверка дублей передач',
                text: 'Если такие передачи уже есть у другого курьера, они больше не добавляются повторно. Приложение сообщает, у какого курьера они уже найдены.',
            },
            {
                title: 'Улучшен экран "Данные"',
                text: 'После загрузки списка приложение теперь оставляет пользователя на экране "Данные" и показывает уведомление о завершении загрузки.',
            },
        ],
    },
    {
        version: 'v1.9.3.5',
        items: [
            {
                title: 'Улучшена стабильность экранов',
                text: 'Исправлены ошибки переходов между страницами. Улучшена стабильность главного экрана, логов и выбора камеры при частых переключениях.',
            },
        ],
    },
    {
        version: 'v1.9.3.4',
        items: [
            {
                title: 'Исправлен список курьеров',
                text: 'Исправлено повторное отображение списка во вкладке "Курьеры". Теперь список не дублируется при обновлении данных.',
            },
        ],
    },
    {
        version: 'v1.9.3.3',
        items: [
            {
                title: 'Исправлен список передач',
                text: 'Исправлено отображение отсканированных передач во вкладке "Курьеры". Теперь такие передачи корректно зачеркиваются в списке.',
            },
        ],
    },
    {
        version: 'v1.9.3.2',
        items: [
            {
                title: 'Обновлен список курьеров',
                text: 'Во вкладке "Курьеры" добавлено общее число передач у каждого курьера.',
            },
        ],
    },
    {
        version: 'v1.9.3.1',
        items: [
            {
                title: 'Исправлены ошибки на iPhone',
                text: 'Исправлена ошибка отображения, из-за которой в некоторых случаях не открывался экран "ШК" на iPhone.',
            },
        ],
    },
    {
        version: 'v1.9.3.0',
        items: [
            {
                title: 'Удаление',
                text: 'Вкладка "Удаление" объединена с вкладкой "Курьеры". Вместо нее добавлена вкладка "ШК".',
            },
            {
                title: 'Добавлена вкладка ШК',
                text: 'Рабочие QR-коды собраны в одном месте: ворота, буфер, межсклад и отгрузка курьеров.',
            },
            {
                title: 'Улучшены настройки',
                text: 'Добавлены страницы "Что нового?" и "Логи".',
            },
            {
                title: 'Добавлены новые темы',
                text: 'Добавлены новые варианты оформления, включая светлую тему и смену цветов кнопок.',
            },
            {
                title: 'Обновлен интерфейс',
                text: 'Обновлен интерфейс внутренних страниц, кнопок и экрана с QR. Улучшено отображение на телефонах.',
            },
        ],
    },
];

export function openWhatsNewPagePanel({
    direction,
    onBack,
    setActiveBottomNav,
    ui,
}) {
    setActiveBottomNav('settings');

    const page = ui.showAppPage({
        bodyClassName: 'whats-new-screen',
        direction,
        onBack,
        pageId: 'whatsNewPage',
        title: 'Что нового?',
    });

    const layout = document.createElement('div');
    layout.className = 'whats-new-page-layout';

    const list = document.createElement('div');
    list.className = 'whats-new-list';

    WHATS_NEW_SECTIONS.forEach((section) => {
        const sectionCard = document.createElement('section');
        sectionCard.className = 'whats-new-card';

        const versionRow = document.createElement('div');
        versionRow.className = 'whats-new-version-row';

        const versionBadge = document.createElement('div');
        versionBadge.className = 'whats-new-version';
        versionBadge.textContent = section.version;
        versionRow.appendChild(versionBadge);

        const newBadgeKey = NEW_BADGE_VERSIONS.get(section.version);
        if (newBadgeKey && shouldShowNewBadge(newBadgeKey)) {
            const newBadge = document.createElement('div');
            newBadge.className = 'whats-new-new-badge';
            newBadge.innerHTML = `
                <span class="whats-new-new-badge-icon" aria-hidden="true">
                    <svg width="14" height="10" viewBox="0 0 28 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.8 1.8L13.7 6.9L18.8 8.8L13.7 10.7L11.8 15.8L9.9 10.7L4.8 8.8L9.9 6.9L11.8 1.8Z" fill="currentColor"/>
                        <path d="M22.2 2.8L23.1 5.2L25.5 6.1L23.1 7L22.2 9.4L21.3 7L18.9 6.1L21.3 5.2L22.2 2.8Z" fill="currentColor" opacity="0.9"/>
                        <path d="M5.2 11.3L6.2 13.9L8.8 14.9L6.2 15.9L5.2 18.5L4.2 15.9L1.6 14.9L4.2 13.9L5.2 11.3Z" fill="currentColor" opacity="0.82"/>
                    </svg>
                </span>
                <span class="whats-new-new-badge-text">New</span>
            `;
            versionRow.appendChild(newBadge);
        }

        if (section === WHATS_NEW_SECTIONS[0]) {
            const latestBadge = document.createElement('div');
            latestBadge.className = 'whats-new-latest-badge';
            latestBadge.textContent = 'Последняя версия';
            versionRow.appendChild(latestBadge);
        }

        sectionCard.appendChild(versionRow);

        section.items.forEach((item) => {
            const itemBlock = document.createElement('div');
            itemBlock.className = 'whats-new-item';

            const itemTitle = document.createElement('div');
            itemTitle.className = 'whats-new-item-title';
            itemTitle.textContent = item.title;

            const itemText = document.createElement('div');
            itemText.className = 'whats-new-item-text';
            itemText.textContent = item.text;

            itemBlock.appendChild(itemTitle);
            itemBlock.appendChild(itemText);
            sectionCard.appendChild(itemBlock);
        });

        list.appendChild(sectionCard);
    });

    layout.appendChild(list);
    page.body.appendChild(layout);

    NEW_BADGE_VERSIONS.forEach((badgeKey) => {
        markNewBadgeSeen(badgeKey);
    });
}
