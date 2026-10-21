# Подключение заявок и задач к вашему Firebase (5 минут)

## 1. Конфиг проекта
Firebase Console → ваш проект → ⚙ Project settings → General →
Your apps → Web app (</>) → скопируйте объект `firebaseConfig`
и вставьте его в файл **firebase-bridge.js** (блок AIRL_FIREBASE_CONFIG).

## 2. Firestore
Console → Build → Firestore Database → Create database (production mode).

## 3. Правила безопасности (Rules)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /requests/{doc} {
      allow create: if true;      // заявки с сайта — только создание
      allow read, update, delete: if false;  // просмотр — через консоль
    }
    match /tasks/{doc} {
      allow read, write: if true; // упростите позже через Auth
    }
  }
}
```
Заявки смотрите в Console → Firestore → коллекция `requests`.

## 4. Telegram-канал для заявок и диагностики
Заявки с формы и результаты airl.kz/diagnostics идут в канал «AIRL-diagnostics»
(t.me/airldiagnostics9089086): botToken и chatId — в firebase-bridge.js (AIRL_TELEGRAM_AGENT)
и в functions/lib/telegram.js (LEADS). Внутренний канал «Задачи AIRL» (@AIRLtasks) сайт не трогает.
