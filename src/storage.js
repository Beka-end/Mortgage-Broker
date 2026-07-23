/* Хранилище настроек и заявок.
   В артефактах Claude использовался window.storage; здесь тот же интерфейс
   поверх localStorage. Чтобы перейти на бэкенд — замените тело методов на fetch. */
const PREFIX = "mb:";

window.storage = {
  async get(key) {
    const value = localStorage.getItem(PREFIX + key);
    return value === null ? null : { key, value };
  },
  async set(key, value) {
    localStorage.setItem(PREFIX + key, value);
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(PREFIX + key);
    return { key, deleted: true };
  },
  async list(prefix = "") {
    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + prefix))
      .map((k) => k.slice(PREFIX.length));
    return { keys, prefix };
  },
};
