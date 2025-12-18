import { Telegraf, Markup } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ===== ДЕБАГ ПЕРЕМЕННЫХ =====
console.log('🔍 DEBUG: Checking environment variables...');
console.log('TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? 'EXISTS (length: ' + process.env.TELEGRAM_BOT_TOKEN.length + ')' : 'MISSING');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'EXISTS' : 'MISSING');
console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY ? 'EXISTS' : 'MISSING');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'EXISTS' : 'MISSING');
console.log('BOSS_TELEGRAM_ID:', process.env.BOSS_TELEGRAM_ID ? 'EXISTS' : 'MISSING');

// ===== ИНИЦИАЛИЗАЦИЯ =====
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BOSS_ID = process.env.BOSS_TELEGRAM_ID;
const KNOWN_CLIENTS = ['Сайакал', 'Анна', 'Марков', 'Ксения'];

// ===== ПОЛУЧИТЬ РОЛЬ ПОЛЬЗОВАТЕЛЯ =====
async function getUserRole(telegramId) {
  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('telegram_id', telegramId.toString())
    .single();

  const isBoss = telegramId.toString() === BOSS_ID;

  return {
    isBoss,
    isEmployee: !!employee,
    name: employee?.name || 'Гость',
    employee
  };
}

// ===== КОМАНДА /START =====
bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  const firstName = ctx.from.first_name;
  const username = ctx.from.username;

  const role = await getUserRole(userId);

  let message = `👋 Привет, ${firstName}!\n\n`;

  if (role.isBoss && role.isEmployee) {
    message += `💼 *Ты руководитель и сотрудник!*\n\n`;
    message += `🤖 Я умный AI помощник. Могу:\n`;
    message += `✅ Записывать работу с уточнениями\n`;
    message += `✅ Отвечать на вопросы по данным\n`;
    message += `✅ Давать отчеты и статистику\n\n`;
    message += `Просто пиши что нужно!\n\n`;
    message += `Команды:\n`;
    message += `/stats - статистика\n`;
    message += `/report - отчет за день\n`;
    message += `/help - помощь`;
  } else if (role.isEmployee) {
    message += `🤖 Я умный AI помощник!\n\n`;
    message += `Могу:\n`;
    message += `✅ Записывать работу\n`;
    message += `✅ Уточнять детали\n`;
    message += `✅ Отвечать на вопросы\n\n`;
    message += `Пиши в свободной форме!\n\n`;
    message += `/stats - статистика\n`;
    message += `/help - помощь`;
  } else if (role.isBoss) {
    message += `💼 *Ты руководитель!*\n\n`;
    message += `Получаешь уведомления о работе.\n\n`;
    message += `/report - отчет\n`;
    message += `/stats - статистика`;
  } else {
    message += `❌ Ты не зарегистрирован.\n\n`;
    message += `Твой ID: \`${userId}\`\n`;
    message += `Username: @${username || 'нет'}\n\n`;
    message += `Передай эти данные руководителю.`;
  }

  await ctx.reply(message, { parse_mode: 'Markdown' });
});

// ===== КОМАНДА /HELP =====
bot.command('help', async (ctx) => {
  const role = await getUserRole(ctx.from.id);

  let message = `📚 *ПОМОЩЬ*\n\n`;

  if (role.isEmployee || role.isBoss) {
    message += `🤖 Я умный AI помощник!\n\n`;
    message += `Пиши мне в свободной форме:\n\n`;
    message += `💬 "Принял заказ 50 боди"\n`;
    message += `💬 "Кто что сделал сегодня?"\n`;
    message += `💬 "Сколько заказов от Анны?"\n\n`;
    message += `Я сам пойму и уточню детали!\n\n`;
  }

  message += `Команды:\n`;
  message += `/start - начало\n`;
  message += `/stats - статистика\n`;
  if (role.isBoss || role.isEmployee) {
    message += `/report - отчет за день\n`;
  }
  message += `/help - помощь`;

  await ctx.reply(message, { parse_mode: 'Markdown' });
});

// ===== КОМАНДА /STATS =====
bot.command('stats', async (ctx) => {
  const userId = ctx.from.id;
  const role = await getUserRole(userId);

  if (!role.isEmployee && !role.isBoss) {
    return ctx.reply('❌ Недостаточно прав');
  }

  // Получаем записи пользователя
  const { data: records } = await supabase
    .from('work_records')
    .select('*')
    .eq('telegram_id', userId.toString())
    .order('created_at', { ascending: false });

  const total = records?.length || 0;

  // Сегодня
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayRecords = records?.filter(r => {
    const d = new Date(r.created_at);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  }) || [];

  // Неделя
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekRecords = records?.filter(r => {
    const d = new Date(r.created_at);
    return d >= weekAgo;
  }) || [];

  const message = 
    `📊 *Статистика ${role.name}*\n\n` +
    `📝 Всего записей: ${total}\n` +
    `📅 За сегодня: ${todayRecords.length}\n` +
    `📆 За неделю: ${weekRecords.length}\n\n` +
    `💪 Так держать!`;

  await ctx.reply(message, { parse_mode: 'Markdown' });
});

// ===== КОМАНДА /REPORT =====
bot.command('report', async (ctx) => {
  const role = await getUserRole(ctx.from.id);

  if (!role.isBoss && !role.isEmployee) {
    return ctx.reply('❌ Недостаточно прав');
  }

  // Получаем записи за сегодня
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: records } = await supabase
    .from('work_records')
    .select('*')
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false });

  if (!records || records.length === 0) {
    return ctx.reply('📊 Сегодня записей пока нет');
  }

  // Группируем по сотрудникам
  const byEmployee = {};
  for (const record of records) {
    if (!byEmployee[record.employee_name]) {
      byEmployee[record.employee_name] = [];
    }

    let entry = record.work_type;
    if (record.client) entry += ` (${record.client})`;
    if (record.quantity) entry += ` - ${record.quantity} шт`;

    byEmployee[record.employee_name].push(entry);
  }

  let message = `📊 *ОТЧЕТ ЗА СЕГОДНЯ*\n\n`;

  for (const [name, works] of Object.entries(byEmployee)) {
    message += `👤 *${name}*\n`;
    for (const work of works) {
      message += `  • ${work}\n`;
    }
    message += `\n`;
  }

  message += `📝 Всего: ${records.length} записей`;

  await ctx.reply(message, { parse_mode: 'Markdown' });
});

// ===== ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ =====
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  // Игнорируем команды
  if (text.startsWith('/')) return;

  const role = await getUserRole(userId);

  // Только сотрудники
  if (!role.isEmployee && !role.isBoss) {
    return;
  }

  try {
    // Получаем контекст
    const context = await getContext();

    // Спрашиваем AI
    const aiDecision = await askAI(text, role, context);

    if (aiDecision.action === 'record') {
      // Записываем работу
      const recordId = await saveWorkRecord(
        role.employee || { name: role.name, telegram_id: userId.toString() },
        userId.toString(),
        text,
        aiDecision.data
      );

      let response = `✅ *Записано! #${recordId}*\n\n`;
      response += `📋 ${aiDecision.data.workType}\n`;
      if (aiDecision.data.client) response += `🏢 ${aiDecision.data.client}\n`;
      if (aiDecision.data.quantity) response += `📦 ${aiDecision.data.quantity} шт`;

      await ctx.reply(response, { parse_mode: 'Markdown' });

      // Уведомляем шефа
      if (!role.isBoss) {
        await notifyBoss(role.name, aiDecision.data, text, recordId);
      }

    } else if (aiDecision.action === 'clarify') {
      // Уточняем
      await ctx.reply(aiDecision.message);

    } else if (aiDecision.action === 'answer') {
      // Отвечаем
      await ctx.reply(aiDecision.message, { parse_mode: 'Markdown' });
    }

  } catch (error) {
    console.error('Error processing message:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуй еще раз.');
  }
});

// ===== ПОЛУЧИТЬ КОНТЕКСТ =====
async function getContext() {
  // Сотрудники
  const { data: employees } = await supabase
    .from('employees')
    .select('name')
    .eq('is_active', true);

  // Клиенты
  const { data: clients } = await supabase
    .from('clients')
    .select('name');

  // Последние работы
  const { data: recentWork } = await supabase
    .from('work_records')
    .select('employee_name, work_type, client, quantity')
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    employees: employees?.map(e => e.name) || [],
    clients: clients?.map(c => c.name) || KNOWN_CLIENTS,
    recentWork: recentWork || []
  };
}

// ===== AI ОБРАБОТКА =====
async function askAI(text, role, context) {
  const systemPrompt = `
Ты умный AI помощник для текстильного производства. Твоя задача - ПОНИМАТЬ и ЗАПИСЫВАТЬ работу сотрудников.

ПОЛЬЗОВАТЕЛЬ: ${role.name} ${role.isBoss ? '(руководитель)' : '(сотрудник)'}

КЛИЕНТЫ: ${context.clients.join(', ')}
СОТРУДНИКИ: ${context.employees.join(', ')}

ПОСЛЕДНИЕ РАБОТЫ:
${context.recentWork.slice(0, 5).map(w => 
  `- ${w.employee_name}: ${w.work_type}${w.client ? ' (' + w.client + ')' : ''}`
).join('\n')}

ТИПЫ РАБОТ (с эмодзи):
📥 Принят заказ - принял, взял, получил заказ
✂️ Пошив - пошил, сшил, шью, готов
📦 Отгрузка - отгрузил, отправил, выдал
📦 Упаковка - упаковал, запаковал
✂️ Раскрой - раскроил, кроил
🏷️ Маркировка - промаркировал, наклеил марки
📝 Работа - всё остальное

ПОНИМАЙ РАЗГОВОРНУЮ РЕЧЬ:
"взял 100 боди Саякал" = Принят заказ, Сайакал, 100
"сделал раскрой для Анны" = Раскрой, Анна
"отгрузил Маркову 50 штук" = Отгрузка, Марков, 50
"500 готово" = нужно уточнить: "Какая работа? Для какого клиента?"
"упаковал" = нужно уточнить: "Сколько и для кого?"

ДЕЙСТВИЯ:
1. **record** - если ВСЯ информация есть (работа + клиент + количество)
2. **clarify** - если не хватает ВАЖНЫХ данных (клиента ИЛИ работы)
3. **answer** - если это вопрос или просьба о данных

ПРАВИЛА УТОЧНЕНИЯ:
- Если есть работа И клиент И количество → СРАЗУ record, БЕЗ уточнений!
- Если нет клиента → "Для какого клиента?"
- Если нет работы → "Какую работу сделал?"
- Если нет количества → записать БЕЗ количества (это необязательно)
- НЕ уточняй детали если информация полная!
- НЕ задавай лишних вопросов!

ОТВЕТ ТОЛЬКО В JSON (без текста до/после):
{
  "action": "record",
  "message": "✅ Понял!",
  "data": {
    "workType": "📥 Принят заказ",
    "client": "Сайакал",
    "quantity": "100",
    "details": "оригинальный текст"
  }
}

ПРИМЕРЫ:

Вход: "взял заказ 200 боди от Анны"
Выход: {"action":"record","message":"✅ Записал!","data":{"workType":"📥 Принят заказ","client":"Анна","quantity":"200","details":"взял заказ 200 боди от Анны"}}

Вход: "сделал раскрой 50 штук"
Выход: {"action":"clarify","message":"Для какого клиента делал раскрой?"}

Вход: "отгрузил Маркову"
Выход: {"action":"clarify","message":"Сколько отгрузил?"}

Вход: "что я делал сегодня?"
Выход: {"action":"answer","message":"Посмотри свою статистику: /stats"}

ВАЖНО:
- Понимай ЛЮБУЮ речь (сленг, сокращения, ошибки)
- Если ВСЁ понятно - НЕ уточняй, сразу record!
- Будь кратким и быстрым!
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ],
    temperature: 0.7,
    max_tokens: 300
  });

  const content = response.choices[0].message.content;
  const jsonMatch = content.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  // Fallback
  return {
    action: 'answer',
    message: 'Не совсем понял. Попробуй переформулировать или напиши /help'
  };
}

// ===== СОХРАНИТЬ ЗАПИСЬ =====
async function saveWorkRecord(employee, telegramId, originalText, data) {
  const { data: record, error } = await supabase
    .from('work_records')
    .insert({
      employee_id: employee.id,
      employee_name: employee.name,
      telegram_id: telegramId,
      work_type: data.workType || '📝 Работа',
      client: data.client || null,
      quantity: data.quantity || null,
      details: data.details || originalText,
      original_text: originalText
    })
    .select()
    .single();

  if (error) throw error;

  return record.id;
}

// ===== УВЕДОМИТЬ ШЕФА =====
async function notifyBoss(employeeName, workData, originalText, recordId) {
  try {
    let message = `🔔 *Новая запись #${recordId}*\n\n`;
    message += `👤 ${employeeName}\n`;
    message += `📋 ${workData.workType}\n`;
    if (workData.client) message += `🏢 ${workData.client}\n`;
    if (workData.quantity) message += `📦 ${workData.quantity} шт\n`;
    message += `\n💬 "${originalText}"`;

    await bot.telegram.sendMessage(BOSS_ID, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error notifying boss:', error);
  }
}

// ===== ЗАПУСК БОТА =====
bot.launch()
  .then(() => {
    console.log('✅ Бот запущен!');
    console.log('📊 База данных подключена');
    console.log('🤖 AI готов к работе');
  })
  .catch(error => {
    console.error('❌ Ошибка запуска:', error);
  });

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
