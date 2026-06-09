"use client";

// Правка 10 (#2): название товара в списке. Обычный левый клик открывает карточку
// в Drawer (событие velo:open-sku, URL не меняется). Ctrl/Cmd/средняя кнопка/Shift
// работают как раньше — это настоящая ссылка на роут карточки (новая вкладка и т.п.).
export default function SkuLink({ id, name, className }: { id: string; name: string; className?: string }) {
  return (
    <a
      href={`/dashboard/skus/${id}`}
      className={className}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("velo:open-sku", { detail: { id } }));
      }}
    >
      {name}
    </a>
  );
}
