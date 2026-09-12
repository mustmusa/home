# 🚀 نشر التطبيق على Vercel

## الطريقة 1: النشر اليدوي (سريع)

### الخطوات:

1. اذهب إلى https://vercel.com
2. سجّل دخول بـ GitHub
3. انقر "Add New" → "Project"
4. اختر repository: `mustmusa/home`
5. في **Environment Variables** أضف (من ملف .env.local الخاص بك):

```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-secret-key>
SESSION_SECRET=<your-random-secret-key>
```

**ملاحظة:** لا تضع الـ secrets في git! احفظها آمنة في Vercel environment variables فقط.

6. اضغط **Deploy**

✅ بعد دقيقة أو دقيقتين، التطبيق سيكون **live**!

---

## الطريقة 2: النشر الأتومات (GitHub Actions)

### إعداد Secrets على GitHub:

1. اذهب إلى: https://github.com/mustmusa/home/settings/secrets/actions

2. أضف 3 secrets جديدة:

#### Secret 1: `VERCEL_TOKEN`
- اذهب إلى https://vercel.com/account/tokens
- انسخ token (أنشئ واحد جديد إذا لم يكن موجود)
- أضفه كـ `VERCEL_TOKEN`

#### Secret 2: `VERCEL_ORG_ID`
- من Vercel dashboard، اذهب إلى Settings
- انسخ Organization ID
- أضفه كـ `VERCEL_ORG_ID`

#### Secret 3: `VERCEL_PROJECT_ID`
- بعد النشر الأول على Vercel، اذهب إلى Project Settings
- انسخ Project ID
- أضفه كـ `VERCEL_PROJECT_ID`

### بعد الإعداد:

```
git push origin claude/home-expenses-app-juab74
```

والتطبيق سينشر **تلقائياً** على Vercel! ✨

---

## الرابط المتوقع بعد النشر:

```
https://home-mustmusa.vercel.app
```

أو أي رابط تختاره Vercel تلقائياً (يظهر بعد النشر الأول).

---

## حل المشاكل الشائعة:

### ❌ خطأ: "Host not in allowlist"
**السبب:** قاعدة البيانات Supabase غير متاحة
**الحل:** أضف IP address من Vercel إلى Supabase allowlist

### ❌ خطأ: "SESSION_SECRET not set"
**السبب:** متغير البيئة ناقص
**الحل:** أضفه إلى Vercel environment variables

### ✅ كل شيء يعمل!
يمكنك الآن:
- 🌐 فتح التطبيق على Vercel
- 📱 تسجيل دخول بـ رقم جوال + PIN
- 👤 استخدام صفحة wife dashboard
- 🔐 تسجيل خروج بأمان
