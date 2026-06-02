export const messages = {
  accessNotFound: (id: string) => `Доступ не найден.\nПередайте администратору ваш ID:\n${id}`,
  relayOffline: "Ассистент временно недоступен. Попробуйте позже.",
  relayQueued: "Ассистент сейчас недоступен. Запрос поставлен в очередь.",
  previousRequestProcessing: "Ассистент еще обрабатывает предыдущий запрос. Дождитесь ответа или отправьте /cancel.",
  contextReset: "Контекст Ассистента сброшен.",
  requestCancelled: "Запрос отменен.",
  noActiveRequest: "Нет активного запроса для отмены.",
  textOnly: "Сейчас поддерживаются только текстовые сообщения.",
  messageTooLong: (limit: number) => `Сообщение слишком длинное. Лимит: ${limit} символов.`,
  chooseAssistant: "Выберите ассистента командой /assistants.",
  connected: (assistantTitle?: string) => `Вы подключены к iirest Assistant.${assistantTitle ? `\nАктивный ассистент: ${assistantTitle}.` : ""}`,
  commands: "Команды: /start, /help, /assistants, /current, /reset, /cancel",
  noAssistants: "Ассистенты не назначены.",
  useAssistantNumber: "Используйте /assistant <номер> для выбора.",
  assistantNotFound: "Ассистент не найден.",
  activeAssistant: (title: string) => `Активный ассистент: ${title}.`,
  noActiveAssistant: "Активный ассистент не выбран."
};
