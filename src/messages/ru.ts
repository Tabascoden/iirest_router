export const messages = {
  accessNotFound: (id: string, requestSent = false) => [
    "Доступ пока не найден.",
    requestSent ? "Я отправил заявку администратору." : "Передайте администратору ваш ID:",
    id,
    "",
    "После подключения напишите /start."
  ].join("\n"),
  relayOffline: "Ресторанный ассистент временно недоступен. Попробуйте позже.",
  relayQueued: "Ресторанный ассистент сейчас недоступен. Запрос поставлен в очередь.",
  previousRequestProcessing: "Предыдущий запрос еще обрабатывается. Дождитесь ответа или отправьте /cancel.",
  contextReset: "Начали новую тему. Контекст текущего ресторана сброшен.",
  requestCancelled: "Запрос отменен.",
  noActiveRequest: "Нет активного запроса для отмены.",
  textOnly: "Сейчас поддерживаются только текстовые сообщения.",
  messageTooLong: (limit: number) => `Сообщение слишком длинное. Лимит: ${limit} символов.`,
  chooseAssistant: "Выберите ресторан.",
  chooseRestaurantButton: "Выберите ресторан:",
  menu: "Выберите действие:",
  connected: (assistantTitle?: string) => [
    "iirest Assistant",
    assistantTitle ? `Активный ресторан: ${assistantTitle}.` : null,
    "",
    "Выберите действие:"
  ].filter((line): line is string => line !== null).join("\n"),
  commands: [
    "Команды:",
    "/start — открыть меню",
    "/help — открыть меню",
    "/commands — показать полный список команд",
    "/id — показать ваши ID для администратора",
    "/restaurants — список доступных ресторанов",
    "/restaurant — начать новую тему",
    "/restaurant <номер> — переключиться на ресторан",
    "/reset — начать новую тему и сбросить контекст текущего ресторана",
    "/cancel — отменить текущий запрос",
    "/admin <текст> — написать администратору"
  ].join("\n"),
  noAssistants: "Рестораны не назначены.",
  useAssistantNumber: "Нажмите кнопку с названием ресторана или используйте /restaurant <номер>.",
  assistantNotFound: "Ресторан не найден.",
  activeAssistant: (title: string) => `Активный ресторан: ${title}.`,
  noActiveAssistant: "Активный ресторан не выбран.",
  accessRequestAdminTitle: "Новая заявка на доступ iirest Assistant"
};
