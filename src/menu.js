const SNU_MENU_URL = 'https://snuco.snu.ac.kr/foodmenu/';
const KOREA_TIME_ZONE = 'Asia/Seoul';
const HOLIDAY_API_BASE_URL = 'https://date.nager.at/api/v3';

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#8211;/g, '-')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeHtmlToText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|section|article|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function extractBlock(text, startPattern, endPattern) {
  const startMatch = text.match(startPattern);
  if (!startMatch || startMatch.index === undefined) {
    return null;
  }

  const rest = text.slice(startMatch.index);
  const endMatch = rest.match(endPattern);
  if (!endMatch || endMatch.index === undefined) {
    return rest;
  }

  return rest.slice(0, endMatch.index);
}

function cleanBlockLines(block) {
  return block
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function splitItemsAndNotes(lines) {
  const items = [];
  const notes = [];

  for (const line of lines) {
    if (line.startsWith('※')) {
      notes.push(line);
    } else {
      items.push(line);
    }
  }

  return { items, notes };
}

function parse302Section(block, mealIndex) {
  const segments = block.split(/(?=<뷔페>)/g).filter((segment) => segment.includes('<뷔페>'));
  const target = segments[mealIndex];
  if (!target) {
    return null;
  }

  const lines = cleanBlockLines(target)
    .map((line) => line.replace(/^302동식당\s*\([^)]+\)\s*/, '').trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const [title, ...rest] = lines;
  const { items, notes } = splitItemsAndNotes(rest);
  return { title, items, notes };
}

function parse301Sections(block) {
  const mealBlock = extractBlock(block, /<식사>/, /<TAKE-OUT>/);
  const facultyBlock = extractBlock(block, /<301동1층\s*교직원전용식당>/, /<TAKE-OUT 카페 301동>|$/);
  const sections = [];

  for (const [title, rawBlock] of [
    ['301동 식사', mealBlock],
    ['301동 1층 교직원전용식당', facultyBlock]
  ]) {
    if (!rawBlock) {
      continue;
    }

    const lines = cleanBlockLines(rawBlock)
      .map((line) => line.replace(/^301동식당\s*\([^)]+\)\s*/, '').trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith('<식사>') && !line.startsWith('<301동1층'));

    const { items, notes } = splitItemsAndNotes(lines);
    sections.push({ title, items, notes });
  }

  return sections;
}

export async function fetchDailySnuMenus() {
  const response = await fetch(SNU_MENU_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch SNU menu page: ${response.status}`);
  }

  const html = await response.text();
  const text = normalizeHtmlToText(html);
  const hall302Block = extractBlock(
    text,
    /302동식당\s*\([^)]+\)/,
    /301동식당\s*\([^)]+\)|\*?\s*버거운버거\s*\([^)]+\)|$/
  );
  const hall301Block = extractBlock(text, /301동식당\s*\([^)]+\)/, /\*?\s*버거운버거\s*\([^)]+\)|$/);

  if (!hall302Block) {
    throw new Error('Could not locate the 302 menu block on the SNU menu page.');
  }

  return {
    lunch: {
      hall301: hall301Block
        ? parse301Sections(hall301Block)
        : [
            {
              title: '301동 식사',
              items: ['오늘 원본 페이지에 301동 메뉴가 표시되지 않았습니다.'],
              notes: []
            }
          ],
      hall302: parse302Section(hall302Block, 0)
    },
    dinner: {
      hall302: parse302Section(hall302Block, 1)
    },
    sourceUrl: SNU_MENU_URL
  };
}

function formatSection(section) {
  const lines = [`*${section.title}*`];

  for (const item of section.items) {
    lines.push(`- ${item}`);
  }

  for (const note of section.notes) {
    lines.push(`- ${note}`);
  }

  return lines.join('\n');
}

export function isKoreanWeekday(now = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: KOREA_TIME_ZONE,
    weekday: 'short'
  }).format(now);

  return weekday !== 'Sat' && weekday !== 'Sun';
}

function koreaDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);

  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';

  return { year: Number(year), isoDate: `${year}-${month}-${day}` };
}

export async function isKoreanBusinessDay(now = new Date()) {
  if (!isKoreanWeekday(now)) {
    return false;
  }

  const { year, isoDate } = koreaDateParts(now);
  const response = await fetch(`${HOLIDAY_API_BASE_URL}/PublicHolidays/${year}/KR`);
  if (!response.ok) {
    throw new Error(`Failed to fetch Korean public holidays: ${response.status}`);
  }

  const holidays = await response.json();
  const holidaySet = new Set(holidays.map((holiday) => holiday.date));
  return !holidaySet.has(isoDate);
}

export function buildSlackMenuMessage(meal, menus) {
  const heading = meal === 'lunch' ? 'lunch 1120?' : 'dinner 1720?';

  if (meal === 'lunch') {
    const blocks = [
      ...menus.lunch.hall301.map(formatSection),
      menus.lunch.hall302 ? formatSection({ ...menus.lunch.hall302, title: '302동 점심 뷔페' }) : null
    ].filter(Boolean);

    return `${heading}\nmenu:\n${blocks.join('\n\n')}\n\nsource: ${menus.sourceUrl}`;
  }

  if (!menus.dinner.hall302) {
    throw new Error('302 dinner menu was not found.');
  }

  return `${heading}\nmenu:\n${formatSection({
    ...menus.dinner.hall302,
    title: '302동 저녁 뷔페'
  })}\n\nsource: ${menus.sourceUrl}`;
}
