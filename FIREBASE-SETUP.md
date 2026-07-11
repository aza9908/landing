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

## 4. Telegram-канал для задач
1. Создайте канал, 2) создайте бота через @BotFather,
3) добавьте бота админом канала,
4) вставьте botToken и chatId (@имя_канала) в firebase-bridge.js (AIRL_TELEGRAM).
