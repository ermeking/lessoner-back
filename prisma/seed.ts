import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type {
  Locale,
  TranslationStatus,
} from '../src/generated/prisma/client.js';

const PUBLISHED: TranslationStatus = 'PUBLISHED';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to run the seed`);
  }
  return value;
}

async function seedAdmin(prisma: PrismaClient) {
  const email = requireEnv('ADMIN_EMAIL').toLowerCase();
  const passwordHash = await argon2.hash(requireEnv('ADMIN_PASSWORD'));

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'ADMIN' },
    create: {
      email,
      passwordHash,
      name: 'Admin',
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
    },
  });
}

async function seedTrackTranslation(
  prisma: PrismaClient,
  trackId: string,
  locale: Locale,
  title: string,
  description: string,
) {
  await prisma.trackTranslation.upsert({
    where: { trackId_locale: { trackId, locale } },
    update: { title, description, status: PUBLISHED },
    create: { trackId, locale, title, description, status: PUBLISHED },
  });
}

async function seedCourseTranslation(
  prisma: PrismaClient,
  courseId: string,
  locale: Locale,
  title: string,
  shortDescription: string,
  description: string,
) {
  await prisma.courseTranslation.upsert({
    where: { courseId_locale: { courseId, locale } },
    update: { title, shortDescription, description, status: PUBLISHED },
    create: {
      courseId,
      locale,
      title,
      shortDescription,
      description,
      status: PUBLISHED,
    },
  });
}

async function seedModuleTranslation(
  prisma: PrismaClient,
  moduleId: string,
  locale: Locale,
  title: string,
) {
  await prisma.moduleTranslation.upsert({
    where: { moduleId_locale: { moduleId, locale } },
    update: { title, status: PUBLISHED },
    create: { moduleId, locale, title, status: PUBLISHED },
  });
}

async function seedLessonTranslation(
  prisma: PrismaClient,
  lessonId: string,
  locale: Locale,
  title: string,
  body: string,
) {
  await prisma.lessonTranslation.upsert({
    where: { lessonId_locale: { lessonId, locale } },
    update: { title, body, status: PUBLISHED },
    create: { lessonId, locale, title, body, status: PUBLISHED },
  });
}

async function seedExerciseTranslation(
  prisma: PrismaClient,
  exerciseId: string,
  locale: Locale,
  title: string,
  statement: string,
  hints: [string, string, string],
) {
  await prisma.exerciseTranslation.upsert({
    where: { exerciseId_locale: { exerciseId, locale } },
    update: { title, statement, hints, status: PUBLISHED },
    create: { exerciseId, locale, title, statement, hints, status: PUBLISHED },
  });
}

async function seedDemoJsCourse(prisma: PrismaClient) {
  const course = await prisma.course.upsert({
    where: { slug: 'demo-js' },
    update: { level: 'JUNIOR', access: 'FREE', price: 0, isPublished: true },
    create: {
      slug: 'demo-js',
      level: 'JUNIOR',
      access: 'FREE',
      price: 0,
      isPublished: true,
    },
  });
  await seedCourseTranslation(
    prisma,
    course.id,
    'ru',
    'Основы JavaScript',
    'Первый курс для тех, кто никогда не программировал.',
    'Демо-курс: переменные, функции и первая практика с автопроверкой.',
  );

  const learningModule = await prisma.module.upsert({
    where: { courseId_slug: { courseId: course.id, slug: 'first-steps' } },
    update: { position: 1 },
    create: { courseId: course.id, slug: 'first-steps', position: 1 },
  });
  await seedModuleTranslation(prisma, learningModule.id, 'ru', 'Первые шаги');

  const lesson1 = await prisma.lesson.upsert({
    where: { courseId_slug: { courseId: course.id, slug: 'hello-world' } },
    update: { moduleId: learningModule.id, position: 1 },
    create: {
      moduleId: learningModule.id,
      courseId: course.id,
      slug: 'hello-world',
      position: 1,
      minutes: 10,
    },
  });
  await seedLessonTranslation(
    prisma,
    lesson1.id,
    'ru',
    'Привет, мир',
    'Первая программа на JavaScript: как объявить функцию и вывести результат в консоль.',
  );
  await seedLessonTranslation(
    prisma,
    lesson1.id,
    'en',
    'Hello, World',
    'Your first JavaScript program: how to declare a function and print output to the console.',
  );

  const exercise1 = await prisma.exercise.upsert({
    where: { lessonId_slug: { lessonId: lesson1.id, slug: 'hello-world' } },
    update: { position: 1 },
    create: {
      lessonId: lesson1.id,
      slug: 'hello-world',
      position: 1,
      runtime: 'JS',
      starterCode: 'function greet() {\n  // напишите код здесь\n}\n',
      solution: "function greet() {\n  console.log('Hello, World!');\n}\n",
      tests: [
        "test({ ru: 'Функция greet объявлена', en: 'Function greet is declared' }, () => {",
        "  expect(typeof greet).toBe('function');",
        '});',
        '',
        "test({ ru: 'Выводит приветствие', en: 'Prints the greeting' }, () => {",
        '  greet();',
        "  expect(output()).toContain('Hello, World!');",
        '});',
      ].join('\n'),
    },
  });
  await seedExerciseTranslation(
    prisma,
    exercise1.id,
    'ru',
    'Привет, мир',
    'Напишите функцию `greet`, которая выводит в консоль строку `Hello, World!`.',
    [
      'Функция объявляется словом `function`.',
      'Внутри функции используйте `console.log`.',
      "Решение: `function greet() { console.log('Hello, World!'); }`",
    ],
  );

  const lesson2 = await prisma.lesson.upsert({
    where: { courseId_slug: { courseId: course.id, slug: 'variables' } },
    update: { moduleId: learningModule.id, position: 2 },
    create: {
      moduleId: learningModule.id,
      courseId: course.id,
      slug: 'variables',
      position: 2,
      minutes: 15,
    },
  });
  await seedLessonTranslation(
    prisma,
    lesson2.id,
    'ru',
    'Переменные и числа',
    'Как объявлять переменные и складывать числа в JavaScript.',
  );

  const exercise2 = await prisma.exercise.upsert({
    where: { lessonId_slug: { lessonId: lesson2.id, slug: 'sum' } },
    update: { position: 1 },
    create: {
      lessonId: lesson2.id,
      slug: 'sum',
      position: 1,
      runtime: 'JS',
      starterCode: 'function sum(a, b) {\n  // напишите код здесь\n}\n',
      solution: 'function sum(a, b) {\n  return a + b;\n}\n',
      tests: [
        "test({ ru: 'Функция sum объявлена', en: 'Function sum is declared' }, () => {",
        "  expect(typeof sum).toBe('function');",
        '});',
        '',
        "test({ ru: 'Складывает положительные числа', en: 'Adds positive numbers' }, () => {",
        '  expect(sum(2, 3)).toBe(5);',
        '});',
      ].join('\n'),
    },
  });
  await seedExerciseTranslation(
    prisma,
    exercise2.id,
    'ru',
    'Сложение чисел',
    'Напишите функцию `sum(a, b)`, которая возвращает сумму двух чисел.',
    [
      'Используйте оператор `+`.',
      'Не забудьте `return`.',
      'Решение: `function sum(a, b) { return a + b; }`',
    ],
  );

  return course;
}

async function seedDemoPaidCourse(prisma: PrismaClient) {
  const course = await prisma.course.upsert({
    where: { slug: 'demo-paid' },
    update: { level: 'JUNIOR', access: 'PAID', price: 100, isPublished: true },
    create: {
      slug: 'demo-paid',
      level: 'JUNIOR',
      access: 'PAID',
      price: 100,
      isPublished: true,
    },
  });
  await seedCourseTranslation(
    prisma,
    course.id,
    'ru',
    'Платный демо-курс',
    'Курс для проверки платного доступа.',
    'Демо-курс с превью-уроком и уроком, закрытым без покупки.',
  );

  const learningModule = await prisma.module.upsert({
    where: { courseId_slug: { courseId: course.id, slug: 'first-steps' } },
    update: { position: 1 },
    create: { courseId: course.id, slug: 'first-steps', position: 1 },
  });
  await seedModuleTranslation(prisma, learningModule.id, 'ru', 'Первые шаги');

  const previewLesson = await prisma.lesson.upsert({
    where: { courseId_slug: { courseId: course.id, slug: 'intro' } },
    update: { moduleId: learningModule.id, position: 1, isPreview: true },
    create: {
      moduleId: learningModule.id,
      courseId: course.id,
      slug: 'intro',
      position: 1,
      isPreview: true,
      minutes: 5,
    },
  });
  await seedLessonTranslation(
    prisma,
    previewLesson.id,
    'ru',
    'Введение (превью)',
    'Открытый урок платного курса — доступен без покупки.',
  );

  const lockedLesson = await prisma.lesson.upsert({
    where: { courseId_slug: { courseId: course.id, slug: 'next-step' } },
    update: { moduleId: learningModule.id, position: 2, isPreview: false },
    create: {
      moduleId: learningModule.id,
      courseId: course.id,
      slug: 'next-step',
      position: 2,
      isPreview: false,
      minutes: 10,
    },
  });
  await seedLessonTranslation(
    prisma,
    lockedLesson.id,
    'ru',
    'Следующий шаг',
    'Обычный урок платного курса — требует покупки.',
  );

  return course;
}

async function seedFrontendTrack(
  prisma: PrismaClient,
  courses: { id: string }[],
) {
  const track = await prisma.track.upsert({
    where: { slug: 'frontend' },
    update: { isPublished: true },
    create: { slug: 'frontend', icon: 'code', position: 1, isPublished: true },
  });
  await seedTrackTranslation(
    prisma,
    track.id,
    'ru',
    'Frontend-разработка',
    'Путь от нуля до middle во frontend-разработке на JavaScript.',
  );

  for (const [index, course] of courses.entries()) {
    await prisma.trackCourse.upsert({
      where: { trackId_courseId: { trackId: track.id, courseId: course.id } },
      update: { position: index + 1 },
      create: { trackId: track.id, courseId: course.id, position: index + 1 },
    });
  }
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg(requireEnv('DATABASE_URL')),
  });
  try {
    await seedAdmin(prisma);
    const demoJs = await seedDemoJsCourse(prisma);
    const demoPaid = await seedDemoPaidCourse(prisma);
    await seedFrontendTrack(prisma, [demoJs, demoPaid]);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
