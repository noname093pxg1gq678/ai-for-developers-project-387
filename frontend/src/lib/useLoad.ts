import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

export type LoadStatus = "loading" | "ready" | "error";

interface LoadResult<T> {
  status: LoadStatus;
  data: T;
  setData: Dispatch<SetStateAction<T>>;
  reload: () => void;
}

/**
 * Переиспользуемая загрузка данных для страницы: статус, данные,
 * обновление после мутаций и повтор при ошибке. Загрузка запускается при
 * монтировании и повторяется через reload, идентичность load между
 * рендерами не важна - берётся последняя переданная функция.
 */
export function useLoad<T>(load: () => Promise<T>, initial: T): LoadResult<T> {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<T>(initial);

  // Последний load держится в ref: эффект не перезапускается из-за новой
  // идентичности функции между рендерами, повтор - только через reload.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const reload = useCallback(() => {
    setStatus("loading");
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        setData(loaded);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { status, data, setData, reload };
}
