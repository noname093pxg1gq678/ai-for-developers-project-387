const META_DESCRIPTION_SELECTOR = 'meta[name="description"]';

/**
 * Обновляет content тега meta[name="description"] в head документа.
 * Если тега нет (не статичен в index.html), создаёт его. Нужен для
 * динамической подстановки описания по маршруту - issue #27.
 */
export function setMetaDescription(content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(
    META_DESCRIPTION_SELECTOR,
  );
  if (!element) {
    element = document.createElement("meta");
    element.name = "description";
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}
