import Link from "next/link";

export const metadata = {
  title: "Политика конфиденциальности — Veloseller",
  description: "Как Veloseller собирает, использует и защищает ваши данные.",
};

const LAST_UPDATED = "15 мая 2026";
const COMPANY = "Veloseller";
const CONTACT_EMAIL = "privacy@veloseller.com";
const DPO_EMAIL = "dpo@veloseller.com";

// ВАЖНО: Этот документ — шаблон. Перед production показать юристу.
// Замени COMPANY/CONTACT_EMAIL/DPO_EMAIL на свои данные.
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link href="/" className="font-display text-xl tracking-tight">Veloseller</Link>
          <nav className="flex gap-6 text-sm font-mono uppercase tracking-wider text-ink-hush">
            <Link href="/terms" className="hover:text-ink">Условия</Link>
            <Link href="/" className="hover:text-ink">Главная</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 prose prose-neutral">
        <h1 className="font-display text-4xl tracking-tight">Политика конфиденциальности</h1>
        <p className="text-ink-hush text-sm">Последнее обновление: {LAST_UPDATED}</p>

        <h2>1. Введение</h2>
        <p>
          {COMPANY} (далее — «мы», «нас», «Сервис») предоставляет SaaS-инструмент для анализа
          скорости продаж и управления запасами e-commerce селлеров. Эта Политика описывает, какие
          персональные данные мы собираем, как используем и какие у вас права.
        </p>
        <p>
          Используя Сервис, вы соглашаетесь с условиями этой Политики. Если не согласны — не используйте Сервис.
        </p>

        <h2>2. Какие данные мы собираем</h2>
        <h3>2.1 Данные аккаунта</h3>
        <ul>
          <li>Email — для регистрации, входа, отправки уведомлений</li>
          <li>Зашифрованный пароль (bcrypt) — для аутентификации (хранится у Supabase Inc.)</li>
          <li>Часовой пояс — для корректного расчёта дневных метрик</li>
          <li>Telegram chat_id — только если вы добровольно подключаете Telegram-уведомления</li>
        </ul>

        <h3>2.2 Данные интеграций</h3>
        <ul>
          <li>API-ключи маркетплейсов (Ozon, Wildberries) — <strong>шифруются Fernet</strong> перед записью в БД</li>
          <li>URL Google Sheets или фидов — в открытом виде</li>
          <li>CSV-файлы — обрабатываются и удаляются после парсинга</li>
        </ul>

        <h3>2.3 Бизнес-данные</h3>
        <ul>
          <li>SKU, остатки, цены, события склада (snapshots, sales-like, replenishment) — ваша собственность</li>
          <li>Производные метрики: TVelo, confidence, coverage, health score</li>
        </ul>

        <h3>2.4 Платёжные данные</h3>
        <p>
          Мы <strong>не храним</strong> данные банковских карт. Платежи проводит
          Stripe, Inc. (PCI-DSS Level 1). Мы храним только Stripe customer ID и subscription ID.
        </p>

        <h2>3. Зачем мы используем данные</h2>
        <ul>
          <li>Расчёт метрик и формирование отчётов</li>
          <li>Отправка email/Telegram-дайджестов важных событий (если включено)</li>
          <li>Биллинг и сопровождение подписки</li>
          <li>Техническая поддержка и улучшение Сервиса</li>
          <li>Защита от мошенничества и злоупотреблений</li>
        </ul>

        <h2>4. С кем мы делимся данными (процессоры)</h2>
        <table>
          <thead><tr><th>Процессор</th><th>Назначение</th><th>Юрисдикция</th></tr></thead>
          <tbody>
            <tr><td>Supabase Inc.</td><td>Хостинг БД и auth</td><td>США / EU</td></tr>
            <tr><td>Stripe, Inc.</td><td>Обработка платежей</td><td>США / EU / UK</td></tr>
            <tr><td>Resend, Inc.</td><td>Транзакционные email</td><td>США</td></tr>
            <tr><td>Telegram Messenger Inc.</td><td>Доставка уведомлений</td><td>UK (HQ)</td></tr>
            <tr><td>Hostland LLC</td><td>VPS-инфраструктура</td><td>РФ</td></tr>
          </tbody>
        </table>
        <p>
          Мы <strong>не продаём</strong> ваши данные третьим сторонам и не используем их для рекламы.
        </p>

        <h2>5. Сколько мы храним данные</h2>
        <ul>
          <li><strong>Активный аккаунт:</strong> пока вы используете Сервис</li>
          <li><strong>Inactive аккаунт:</strong> 12 месяцев после последнего входа, затем уведомление об удалении</li>
          <li><strong>После удаления:</strong> данные удаляются из активной БД немедленно, из бэкапов — в течение 30 дней</li>
          <li><strong>Биллинг-записи:</strong> 7 лет (требование налогового законодательства)</li>
          <li><strong>Логи:</strong> 90 дней</li>
        </ul>

        <h2>6. Ваши права (GDPR)</h2>
        <p>В соответствии с GDPR (статьи 15–22) у вас есть права:</p>
        <ul>
          <li><strong>Доступ</strong> — узнать какие данные мы храним. Кнопка «Экспорт данных» в <Link href="/account">/account</Link></li>
          <li><strong>Исправление</strong> — обновить неточные данные в настройках профиля</li>
          <li><strong>Удаление</strong> — потребовать удаления аккаунта. Кнопка «Удалить аккаунт» в <Link href="/account">/account</Link></li>
          <li><strong>Переносимость</strong> — получить данные в JSON для переноса в другой сервис</li>
          <li><strong>Ограничение обработки</strong> — приостановить обработку, оставив хранение</li>
          <li><strong>Возражение</strong> — отказаться от обработки на основании legitimate interest</li>
          <li><strong>Жалоба</strong> — обратиться в надзорный орган (для EU — DPA вашей страны)</li>
        </ul>
        <p>Запросы по правам обрабатываем в течение 30 дней. Контакт: <a href={`mailto:${DPO_EMAIL}`}>{DPO_EMAIL}</a></p>

        <h2>7. Cookies и трекеры</h2>
        <p>Мы используем минимум cookies:</p>
        <ul>
          <li><strong>Auth cookies</strong> (Supabase): для поддержания сессии. Необходимы. Срок: 7 дней.</li>
          <li><strong>CSRF tokens</strong>: защита от атак. Необходимы.</li>
          <li><strong>Cookie consent</strong>: ваш выбор по аналитике. Хранится в localStorage.</li>
          <li><strong>Analytics</strong> (Umami): обезличенная статистика посещений. <strong>Только с вашего согласия</strong> через cookie-баннер.</li>
        </ul>
        <p>Мы <strong>не используем</strong> Google Analytics, Meta Pixel или другие рекламные трекеры.</p>

        <h2>8. Безопасность данных</h2>
        <ul>
          <li>TLS 1.3 для всех соединений</li>
          <li>Encryption at rest для БД (Supabase)</li>
          <li>Fernet-шифрование для API-ключей маркетплейсов</li>
          <li>Row Level Security (RLS) — пользователь видит только свои данные</li>
          <li>SSH key-only доступ к VPS, fail2ban, ufw firewall</li>
          <li>Регулярные security updates (unattended-upgrades)</li>
        </ul>

        <h2>9. Несовершеннолетние</h2>
        <p>
          Сервис не предназначен для лиц младше 18 лет. Если мы узнаем, что собрали данные несовершеннолетнего
          без согласия родителей, мы удалим их.
        </p>

        <h2>10. Изменения Политики</h2>
        <p>
          О существенных изменениях уведомляем email за 14 дней до вступления в силу. Дата последнего
          обновления указана в начале документа.
        </p>

        <h2>11. Контакты</h2>
        <ul>
          <li>Общие вопросы: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>
          <li>Data Protection Officer: <a href={`mailto:${DPO_EMAIL}`}>{DPO_EMAIL}</a></li>
        </ul>

        <hr />
        <p className="text-ink-hush text-sm">
          <strong>Внимание:</strong> этот документ — шаблон, требующий проверки юристом перед использованием
          в production. Заполните юридическое наименование, адрес и контакты ответственного лица.
        </p>
      </main>
    </div>
  );
}
