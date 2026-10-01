const { execSync } = require('child_process');

console.log('🔧 Создаю таблицы в БД...');

try {
  execSync('npx prisma db push', { stdio: 'inherit' });
  console.log('✅ Таблицы созданы! Теперь верни главный файл на index.js');
} catch (error) {
  console.error('❌ Ошибка:', error.message);
}
