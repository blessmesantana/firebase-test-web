const TOAST_SECTIONS = [
    {
        title: 'Зеленые уведомления',
        description: 'Обычные успешные уведомления приложения. Вызываются через реальный ui.showToast(...).',
        items: [
            { label: 'Список загружен', text: 'Список загружен', type: 'success', duration: 1800 },
            { label: 'Список загружен, дубли пропущены', text: 'Список загружен, дубли пропущены', type: 'success', duration: 1800 },
            { label: 'Дубли пропущены', text: 'Дубли пропущены', type: 'success', duration: 1800 },
            { label: 'Передачи уже есть у другого курьера', text: 'Передачи уже есть у другого курьера', type: 'success', duration: 1800 },
            { label: 'Часть передач уже есть у другого курьера', text: 'Часть передач уже есть у другого курьера', type: 'success', duration: 1800 },
            { label: 'Передача удалена', text: 'Передача удалена', type: 'success', duration: 1800 },
            { label: 'Курьер удален', text: 'Курьер удален', type: 'success', duration: 1800 },
            { label: 'Передачи удалены', text: 'Передачи удалены', type: 'success', duration: 1800 },
            { label: 'Все данные удалены', text: 'Все данные удалены', type: 'success', duration: 1800 },
            { label: 'Лог скопирован', text: 'Лог скопирован', type: 'success', duration: 1600 },
            { label: 'Настройки темы сброшены', text: 'Настройки темы сброшены', type: 'success', duration: 1800 },
        ],
    },
    {
        title: 'Красные уведомления',
        description: 'Обычные ошибки и служебные проблемы. Это не сканирующие overlay, а тот же слой toast, который живет в приложении.',
        items: [
            { label: 'Не удалось загрузить передачи', text: 'Не удалось загрузить передачи', type: 'error', duration: 2200 },
            { label: 'Не удалось загрузить курьеров', text: 'Не удалось загрузить курьеров', type: 'error', duration: 2200 },
            { label: 'Не удалось скопировать лог', text: 'Не удалось скопировать лог', type: 'error', duration: 1600 },
            { label: 'Неверный пароль', text: 'Неверный пароль', type: 'error', duration: 1800 },
            { label: 'Введите данные', text: 'Введите данные', type: 'error', duration: 2200 },
            { label: 'Ошибка разбора данных', text: 'Ошибка разбора данных', type: 'error', duration: 2200 },
            { label: 'Не найдено имя курьера', text: 'Не найдено имя курьера', type: 'error', duration: 2200 },
            { label: 'Не найдены номера передач', text: 'Не найдены номера передач', type: 'error', duration: 2200 },
            { label: 'Ошибка при сохранении', text: 'Ошибка при сохранении', type: 'error', duration: 2200 },
        ],
    },
];

export function openAdminPanelPagePanel({
    direction,
    onBack,
    setActiveBottomNav,
    ui,
}) {
    setActiveBottomNav('settings');

    const page = ui.showAppPage({
        bodyClassName: 'admin-panel-screen',
        direction,
        onBack,
        pageId: 'adminPanelPage',
        title: 'Админ панель',
    });

    const layout = document.createElement('div');
    layout.className = 'admin-panel-layout';

    const intro = document.createElement('div');
    intro.className = 'admin-panel-intro';
    intro.textContent = 'Здесь собраны кнопки для вызова обычных уведомлений приложения. Уведомления сканирования не дублируются и не меняются.';
    layout.appendChild(intro);

    TOAST_SECTIONS.forEach((section) => {
        const card = document.createElement('section');
        card.className = 'admin-panel-section';

        const title = document.createElement('div');
        title.className = 'admin-panel-section-title';
        title.textContent = section.title;

        const description = document.createElement('div');
        description.className = 'admin-panel-section-description';
        description.textContent = section.description;

        const buttons = document.createElement('div');
        buttons.className = 'admin-panel-button-list';

        section.items.forEach((item) => {
            const button = ui.createPrimaryButton(item.label, {
                className: 'data-entry-submit-button admin-panel-trigger-button',
            });

            button.addEventListener('click', () => {
                ui.showToast(item.text, {
                    duration: item.duration,
                    type: item.type,
                });
            });

            buttons.appendChild(button);
        });

        card.appendChild(title);
        card.appendChild(description);
        card.appendChild(buttons);
        layout.appendChild(card);
    });

    page.body.appendChild(layout);
}
