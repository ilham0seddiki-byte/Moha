# الباحث المباشر (Cloudflare Worker)

هاد الـ Worker كيقلب فيوتيوب على أي كلمة بالإسبانية، كيجيب النص ديال الفيديوهات (عن طريق Firecrawl)،
وكيرجع الثانية اللي تقالت فيها الكلمة. الموقع (`es/index.html`) كيبين كل نتيجة كـ clip ديال ~4 ثواني.

## كيفاش تحطو (مرة وحدة، ~5 دقايق، فابور)

1. **الساروت ديال Firecrawl:** دخل لـ https://www.firecrawl.dev/app/api-keys وكوبي الساروت (كيبدا بـ `fc-`).
2. **حساب Cloudflare:** دير حساب فابور فـ https://dash.cloudflare.com/sign-up
3. **دير Worker:** Workers & Pages ← Create ← Create Worker ← سميه `escucha` ← Deploy.
4. **حط الكود:** Edit code ← مسح كلشي ← لصق المحتوى ديال `worker/worker.js` ← Deploy.
5. **حط الساروت:** Settings ← Variables and Secrets ← Add:
   - Type: **Secret**، Name: `FIRECRAWL_API_KEY`، Value: الساروت ديالك ← Deploy.
6. **جرّب:** حل `https://escucha.<حسابك>.workers.dev/?q=gracias` — خاصك تشوف `clips`.
7. **صيفط ليا الرابط** ولا حطو فـ `es/index.html` فالسطر `const API = '';`

## الثمن

- كلمة جديدة: بحث واحد + 6 ديال الفيديوهات ≈ **35 crédit** ديال Firecrawl، وكتاخد ~5–10 ثواني.
- نفس الكلمة مرة أخرى (حتى 7 أيام): **فابور** وزربة (cache).

## الحماية (مهم)

أي واحد عندو الرابط ديال الـ Worker يقدر يصرف الكريديات ديالك.
باش غير الموقع ديالك اللي يقدر يستعملو، زيد فـ Settings ← Variables:
Type: **Text**، Name: `ALLOWED_ORIGIN`، Value: `https://ilham0seddiki-byte.github.io`
