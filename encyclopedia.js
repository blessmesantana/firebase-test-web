const ENCYCLOPEDIA_SECTIONS = [
    {
        title: 'Данные',
        iconMarkup: `
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="5" y="3.5" width="14" height="17" rx="2.5" stroke="currentColor" stroke-width="1.7"/>
                <path d="M9 8.5H15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                <path d="M9 12H15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                <path d="M9 15.5H13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
        `,
        description: 'Этот раздел используется для загрузки записей и передач в базу. В качестве названия можно использовать как фамилию курьера, так и название направления.',
        details: [
            'Из первой строки приложение берёт первое слово как основное название записи. Дальше из остального текста ищутся только номера передач.',
            'Если номер передачи записан с пробелами, дефисами, буквами внутри или имеет другую длину, такой номер не будет распознан как передача.',
            'Остальной текст сам по себе не мешает загрузке. Приложение использует его только для поиска корректных 10-значных номеров передач.',
        ],
        notes: [
            'Если запись с таким названием уже существует, новые передачи добавляются к ней, а вторая такая запись не создаётся.',
            'Сравнение названий идёт без учёта регистра. Например, "Иванов", "иванов" и "ИВАНОВ" считаются одной и той же записью.',
            'Если передача уже есть у этой же записи, она не добавляется повторно.',
            'Если передача уже числится за другой записью, она тоже не добавляется. Приложение сообщает, у какой записи найден конфликт.',
            'Если в тексте не удалось определить название или не найдено ни одной передачи, показывается ошибка.',
        ],
    },
    {
        title: 'Курьеры',
        iconMarkup: `
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 11C9.65685 11 11 9.65685 11 8C11 6.34315 9.65685 5 8 5C6.34315 5 5 6.34315 5 8C5 9.65685 6.34315 11 8 11Z" stroke="currentColor" stroke-width="1.7"/>
                <path d="M16.5 10C17.8807 10 19 8.88071 19 7.5C19 6.11929 17.8807 5 16.5 5C15.1193 5 14 6.11929 14 7.5C14 8.88071 15.1193 10 16.5 10Z" stroke="currentColor" stroke-width="1.7"/>
                <path d="M3.5 18C3.5 15.7909 5.29086 14 7.5 14H8.5C10.7091 14 12.5 15.7909 12.5 18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                <path d="M13.5 18C13.5 16.067 15.067 14.5 17 14.5H17.5C19.433 14.5 21 16.067 21 18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
        `,
        description: 'Здесь отображается весь рабочий список записей и их передач. В списке показываются те названия, которые были загружены первой строкой: это может быть как фамилия курьера, так и название направления.',
        details: [
            'У каждого курьера справа показывается счётчик в формате "отсканировано / всего". По нему можно сразу понять, сколько передач уже закрыто.',
            'Неотсканированные передачи отображаются обычным текстом. Отсканированные остаются в списке, зачеркиваются и получают рядом дату и время последнего сканирования.',
            'Внутри раскрытого списка сначала идут неотсканированные передачи. После них идут отсканированные, причём среди отсканированных выше показываются последние по времени.',
        ],
        notes: [
            'Если у курьера все передачи отсканированы, он считается завершённым и помечается отдельным индикатором.',
            'Из этого раздела можно удалить курьера целиком.',
            'Из этого же раздела можно удалить только одну конкретную передачу, не затрагивая остальные.',
        ],
    },
    {
        title: 'QR',
        iconMarkup: `
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 12H12V17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3 12H3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M8 17H8.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M12 21H12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M21 12H21.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M3 17H4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M15.5 12H17.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M3 21H8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M12 2V8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M17.6 21H19.4C19.96 21 20.24 21 20.454 20.891C20.6422 20.7951 20.7951 20.6422 20.891 20.454C21 20.2401 21 19.96 21 19.4V17.6C21 17.04 21 16.7599 20.891 16.546C20.7951 16.3578 20.6422 16.2049 20.454 16.109C20.2401 16 19.96 16 19.4 16H17.6C17.04 16 16.7599 16 16.546 16.109C16.3578 16.2049 16.2049 16.3578 16.109 16.546C16 16.7599 16 17.04 16 17.6V19.4C16 19.96 16 20.2401 16.109 20.454C16.2049 20.6422 16.3578 20.7951 16.546 20.891C16.7599 21 17.04 21 17.6 21Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                <path d="M17.6 8H19.4C19.96 8 20.2401 8 20.454 7.89101C20.6422 7.79513 20.7951 7.64215 20.891 7.45399C21 7.24008 21 6.96005 21 6.4V4.6C21 4.03995 21 3.75992 20.891 3.54601C20.7951 3.35785 20.6422 3.20487 20.454 3.10899C20.2401 3 19.9601 3 19.4 3H17.6C17.0399 3 16.7599 3 16.546 3.10899C16.3578 3.20487 16.2049 3.35785 16.109 3.54601C16 3.75992 16 4.03995 16 4.6V6.4C16 6.96005 16 7.24008 16.109 7.45399C16.2049 7.64215 16.3578 7.79513 16.546 7.89101C16.7599 8 17.0399 8 17.6 8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                <path d="M4.6 8H6.4C6.96005 8 7.24008 8 7.45399 7.89101C7.64215 7.79513 7.79513 7.64215 7.89101 7.45399C8 7.24008 8 6.96005 8 6.4V4.6C8 4.03995 8 3.75992 7.89101 3.54601C7.79513 3.35785 7.64215 3.20487 7.45399 3.10899C7.24008 3 6.96005 3 6.4 3H4.6C4.03995 3 3.75992 3 3.54601 3.10899C3.35785 3.20487 3.20487 3.35785 3.10899 3.54601C3 3.75992 3 4.03995 3 4.6V6.4C3 6.96005 3 7.24008 3.10899 7.45399C3.20487 7.64215 3.35785 7.79513 3.54601 7.89101C3.75992 8 4.03995 8 4.6 8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
            </svg>
        `,
        description: 'Это основной раздел для сканирования передач. Здесь можно работать как через камеру, так и через ручной ввод номера.',
        details: [
            'Для поиска передачи приложение использует либо полный 10-значный номер, либо последние 4 цифры. Если по короткому номеру найдено несколько совпадений, появляется выбор из найденных передач.',
            'Если передача найдена и ещё не была отсканирована, она записывается в сканы с текущим временем. Если такая передача уже сканировалась раньше, приложение показывает, что она уже была отсканирована.',
            'Если номер не найден в списке передач или его формат не распознан, показывается ошибка.',
        ],
        scanExamples: [
            {
                title: 'Успешный скан',
                type: 'success',
                text: 'Тест',
            },
            {
                title: 'Повторный скан',
                type: 'already-scanned',
                text: 'Тест',
            },
            {
                title: 'Полный номер',
                type: 'error',
                text: '1234567890\nне найдена в списке',
            },
            {
                title: 'Короткий номер',
                type: 'error',
                text: '1234 не найдена в списке',
            },
        ],
        notes: [
            'Свайп по кнопке сканирования останавливает камеру.',
            'Нужную камеру можно выбрать в настройках.',
        ],
    },
    {
        title: 'ШК',
        iconMarkup: `
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 6.5V17.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                <path d="M7 8V16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                <path d="M10 5.5V18.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                <path d="M13 8V16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                <path d="M16 5.5V18.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                <path d="M19 8V16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                <path d="M21 6.5V17.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
        `,
        description: 'Раздел содержит служебные QR-коды, которые используются в работе как готовые точки сканирования.',
        details: [
            'Коды разложены по отдельным группам: ворота, буфер, межсклад и отгрузка курьеров.',
            'На узких экранах блоки отображаются компактнее, чтобы в видимую область помещалось больше кодов.',
        ],
        notes: [],
    },
    {
        title: 'Настройки',
        iconMarkup: `
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 8.75C10.2051 8.75 8.75 10.2051 8.75 12C8.75 13.7949 10.2051 15.25 12 15.25C13.7949 15.25 15.25 13.7949 15.25 12C15.25 10.2051 13.7949 8.75 12 8.75Z" stroke="currentColor" stroke-width="1.7"/>
                <path d="M19 12C19 11.5498 18.9639 11.108 18.8945 10.6777L20.5 9.42871L18.5713 6.08301L16.6328 6.75293C15.9586 6.22377 15.1927 5.80739 14.3682 5.53125L14.0625 3.5H9.9375L9.63184 5.53125C8.80734 5.80739 8.04143 6.22377 7.36719 6.75293L5.42871 6.08301L3.5 9.42871L5.10547 10.6777C5.03614 11.108 5 11.5498 5 12C5 12.4502 5.03614 12.892 5.10547 13.3223L3.5 14.5713L5.42871 17.917L7.36719 17.2471C8.04143 17.7762 8.80734 18.1926 9.63184 18.4688L9.9375 20.5H14.0625L14.3682 18.4688C15.1927 18.1926 15.9586 17.7762 16.6328 17.2471L18.5713 17.917L20.5 14.5713L18.8945 13.3223C18.9639 12.892 19 12.4502 19 12Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
            </svg>
        `,
        description: 'В этом разделе собраны параметры оформления и служебные разделы приложения.',
        details: [
            'Здесь доступны смена темы, цвет кнопок, выбор камеры, а также внутренние разделы "Что нового?" и "Справка".',
            'Внутри "Настройки темы" можно отдельно менять тему приложения и цвет кнопок, а кнопкой "По умолчанию" возвращать стандартные значения.',
        ],
        notes: [],
    },
];

export function openEncyclopediaPagePanel({
    direction,
    onBack,
    setActiveBottomNav,
    ui,
}) {
    setActiveBottomNav('settings');

    const page = ui.showAppPage({
        bodyClassName: 'encyclopedia-screen',
        direction,
        onBack,
        pageId: 'encyclopediaPage',
        title: 'Справка',
    });

    const layout = document.createElement('div');
    layout.className = 'encyclopedia-page-layout';

    const list = document.createElement('div');
    list.className = 'encyclopedia-list';

    ENCYCLOPEDIA_SECTIONS.forEach((section) => {
        const card = document.createElement('section');
        card.className = 'encyclopedia-card';

        const header = document.createElement('div');
        header.className = 'encyclopedia-card-header';

        const icon = document.createElement('div');
        icon.className = 'encyclopedia-card-icon';
        icon.innerHTML = section.iconMarkup;

        const title = document.createElement('div');
        title.className = 'encyclopedia-card-title';
        title.textContent = section.title;

        const description = document.createElement('div');
        description.className = 'encyclopedia-card-text';
        description.textContent = section.description;

        const details = document.createElement('div');
        details.className = 'encyclopedia-card-details';

        section.details.forEach((detailText) => {
            const detail = document.createElement('div');
            detail.className = 'encyclopedia-card-detail';
            detail.textContent = detailText;
            details.appendChild(detail);
        });

        header.appendChild(icon);
        header.appendChild(title);
        card.appendChild(header);
        card.appendChild(description);
        card.appendChild(details);

        if (Array.isArray(section.scanExamples) && section.scanExamples.length > 0) {
            const examplesLabel = document.createElement('div');
            examplesLabel.className = 'encyclopedia-card-notes-label';
            examplesLabel.textContent = 'Примеры уведомлений';

            const examples = document.createElement('div');
            examples.className = 'encyclopedia-scan-examples';

            section.scanExamples.forEach((example) => {
                const exampleCard = document.createElement('div');
                exampleCard.className = `encyclopedia-scan-example encyclopedia-scan-example--${example.type || 'default'}`;

                const exampleLabel = document.createElement('div');
                exampleLabel.className = 'encyclopedia-scan-example-label';
                exampleLabel.textContent = example.title || '';

                const examplePill = document.createElement('div');
                examplePill.className = 'encyclopedia-scan-example-pill';

                if (example.transferId) {
                    const exampleId = document.createElement('span');
                    exampleId.className = 'encyclopedia-scan-example-id';
                    exampleId.textContent = example.transferId;
                    examplePill.appendChild(exampleId);
                } else if (example.type !== 'error') {
                    const exampleLeadSpacer = document.createElement('span');
                    exampleLeadSpacer.className = 'encyclopedia-scan-example-spacer';
                    exampleLeadSpacer.setAttribute('aria-hidden', 'true');
                    examplePill.appendChild(exampleLeadSpacer);
                }

                const exampleText = document.createElement('span');
                exampleText.className = 'encyclopedia-scan-example-text';
                exampleText.textContent = example.text;
                examplePill.appendChild(exampleText);

                if (example.type !== 'error') {
                    const exampleSpacer = document.createElement('span');
                    exampleSpacer.className = 'encyclopedia-scan-example-spacer';
                    exampleSpacer.setAttribute('aria-hidden', 'true');
                    examplePill.appendChild(exampleSpacer);
                }

                exampleCard.appendChild(exampleLabel);
                exampleCard.appendChild(examplePill);
                examples.appendChild(exampleCard);
            });

            card.appendChild(examplesLabel);
            card.appendChild(examples);
        }

        if (section.notes.length > 0) {
            const notesLabel = document.createElement('div');
            notesLabel.className = 'encyclopedia-card-notes-label';
            notesLabel.textContent = 'Полезно знать';

            const notes = document.createElement('div');
            notes.className = 'encyclopedia-card-notes';

            section.notes.forEach((noteText) => {
                const note = document.createElement('div');
                note.className = 'encyclopedia-card-note';
                note.textContent = noteText;
                notes.appendChild(note);
            });

            card.appendChild(notesLabel);
            card.appendChild(notes);
        }

        list.appendChild(card);
    });

    layout.appendChild(list);
    page.body.appendChild(layout);
}
