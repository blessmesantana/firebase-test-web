const WHATS_NEW_SECTIONS = [
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
                text: 'Улучшен раздел настроек. Добавлена смена цвета кнопок и отдельная страница логов.',
            },
            {
                title: 'Добавлены новые темы',
                text: 'Добавлены новые варианты оформления, включая светлую тему.',
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
        pageId: 'whatsNewPage',
        title: 'Что нового?',
    });

    const layout = document.createElement('div');
    layout.className = 'whats-new-page-layout';

    const backButton = ui.createSecondaryButton('Назад к настройкам', {
        className: 'whats-new-back-button',
    });
    backButton.addEventListener('click', onBack);

    const list = document.createElement('div');
    list.className = 'whats-new-list';

    WHATS_NEW_SECTIONS.forEach((section) => {
        const sectionCard = document.createElement('section');
        sectionCard.className = 'whats-new-card';

        const versionBadge = document.createElement('div');
        versionBadge.className = 'whats-new-version';
        versionBadge.textContent = section.version;

        sectionCard.appendChild(versionBadge);

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

    layout.appendChild(backButton);
    layout.appendChild(list);
    page.body.appendChild(layout);
}
