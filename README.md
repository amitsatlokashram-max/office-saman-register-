# Office Saman Register (Next.js)

Office ke liye mangaye saman ka register: kya mangaya, kab aaya, kisne laya, kitne ka aaya, aapke apne paise, kisko diya, stock, warranty aur bill. Phone aur computer dono pe chalta hai, aur team ke saath live sync hota hai.

Ye **Next.js** app hai. Data **Firebase** (Firestore) me rehta hai aur website **Vercel** pe free me chalti hai.

**Kya-kya hai**

Har kaam ka apna page hai. Baayi taraf menu: **Dashboard, Saman, Stock, Kisko diya, Hisaab, Settings, Logout**. Phone pe upar ☰ button dabao, wahi menu baayi taraf se khulta hai. Har page pe upar **Naya saman** button hai.

| Page | Link | Kya dikhta hai |
|---|---|---|
| Dashboard | `/` | Is mahine ka kharcha, kul kharcha, kya nahi aaya, mere paise baaki; pichhle 6 mahine ka chart; "Dhyan do" (kam stock, warranty, bina bill); haal ki entries aur haal me kisko diya |
| Saman ki list | `/saman` | Har entry ki table (phone pe cards), filter, kul jod |
| Stock | `/stock` | Ek naam ke saman ka jod, "kam se kam" stock |
| Kisko diya | `/kisko-diya` | Kisko kab kya diya, wapas / kharab / return |
| Hisaab | `/hisaab` | Mahine, dukaan, category, department, mera paisa |
| Settings | `/settings` | Aapka account, Team, AI aur Google Sheet ki halat |

- Har page pe **Print** button: saaf A4 page banta hai (menu, button, filter nahi chhapte; upar register ka naam, page, tareekh aur laga hua filter). Printer na ho to print window me "Save as PDF" chuno
- Har entry kholo → **Print parchi**: us saman ki ek page ki parchi, jisme kisko diya ki table me har bande ke sign ki jagah, aur neeche "Dene wale ka sign / Lene wale ka sign"
- Har saman ki entry: piece × rate = total apne aap judta hai
- Bill ki photo ya PDF lagao. AI chalu ho to bill lagate hi bill no., saman, rate, total, tareekh khud bhar jaate hai
- "Mera paisa": aapne apni jeb se kitne diye, kitne wapas mile, kitne baaki
- Kisko diya: ek saman alag-alag logo ko, har bande ki alag line (naam, department, piece). Wapas aaya, kharab, dukaan ko return bhi
- Stock: "kam se kam" stock ka laal alert
- Serial no. aur warranty (30 din pehle yaad dilata hai)
- Excel (CSV) download
- Google se login, sirf aap aur aapki team andar aa sakti hai. Browser band karte hi logout, menu me Logout
- **Google Sheet + Drive (optional):** har entry apne aap Google Sheet me likhi jaati hai aur har bill ki photo Google Drive ke folder me save hoti hai

> **Pehle wala GitHub Pages / Firebase version chala rahe ho?** To Step 1 se 5 dobara nahi karne. Wahi Firebase project yahan bhi chalega aur saara purana data waisa hi dikhega. Seedha Step 6 se shuru karo, aur Step 2 wali values Vercel me daalo.

---

## Setup: ek baar karna hai (lagbhag 20 minute)

### Step 1: Firebase project banao

1. [console.firebase.google.com](https://console.firebase.google.com) kholo aur Google account se sign in karo.
2. **Create a project** dabao, naam do (jaise `office-saman-register`), Google Analytics band kar sakte ho, **Create project** dabao.

### Step 2: Web app jodo aur config note karo

1. Project ke home page pe **`</>`** (Web) icon dabao.
2. Nickname do (jaise `register`), "Firebase Hosting" ka tick **mat** lagao, **Register app** dabao.
3. Ek code dikhega jisme `firebaseConfig` hai. Isme se 6 values chahiye: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`. Ye page khula rakho ya values kahin copy kar lo. Baad me bhi **Project settings (gear icon) → Your apps** me mil jaati hai.

### Step 3: Google sign-in chalu karo

**Build → Authentication → Get started → Sign-in method → Google → Enable**, support email chuno, **Save**.

### Step 4: Database banao

**Build → Firestore Database → Create database**. Location **asia-south1 (Mumbai)** ya **asia-south2 (Delhi)** chuno (baad me badal nahi sakte). **Start in production mode → Create**.

### Step 5: Safety rules lagao (zaroori)

1. Firestore Database me **Rules** tab kholo, jo likha hai sab hata do.
2. Is project ki `firestore.rules` file ka poora text paste karo.
3. `APNA_EMAIL@gmail.com` ki jagah **apna Gmail** likho, sirf chhote letters me.
4. **Publish** dabao.

### Step 6: Code ko GitHub pe daalo (GitHub Desktop se)

1. Zip ko unzip karo. `office-saman-register-nextjs` folder milega.
2. GitHub Desktop me **File → Add Local Repository → Choose…**, ye folder chuno.
3. "This directory does not appear to be a Git repository" aaye to usi me **create a repository** dabao, phir **Create Repository**.
4. **Publish repository** dabao. Is baar **private** rakh sakte ho, Vercel private repo bhi chala leta hai.

### Step 7: Vercel pe website chalu karo

1. [vercel.com](https://vercel.com) kholo, **Sign Up → Continue with GitHub**.
2. **Add New… → Project** dabao, apni repo ke saamne **Import** dabao.
3. **Environment Variables** khol ke ye 6 values daalo (Step 2 wali):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_FIREBASE_API_KEY` | apiKey |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | authDomain |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | projectId |
   | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | storageBucket |
   | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | messagingSenderId |
   | `NEXT_PUBLIC_FIREBASE_APP_ID` | appId |

   Aasaan tareeka: `.env.example` file kholo, Firebase wali 6 lines me `=` ke aage value bharo, AI wali lines hata do (AI baad me neeche wale hisse se jodna), aur bacha hua text Vercel ke pehle **Key** wale khane me paste kar do. Vercel sab ek saath bhar deta hai.
4. **Deploy** dabao. 1-2 minute me link mil jayega, jaise `https://office-saman-register.vercel.app`.

### Step 8: Website ko Firebase me allow karo

Firebase console → **Authentication → Settings → Authorized domains → Add domain** → apna Vercel domain likho (jaise `office-saman-register.vercel.app`, bina `https://`) → **Add**.

### Step 9: Kholo aur shuru karo

Link kholo, **Google se sign in karo** dabao. Phone pe browser menu se **"Add to Home screen"** kar lo, app ki tarah khulega.

Aage se GitHub Desktop me **Push** karte hi Vercel website apne aap update kar deta hai.

---

## AI se bill padhna (optional)

Bill lagate hi form apne aap bharwana ho to ek API key chahiye. Key **sirf Vercel server pe** rehti hai, kisi phone ya browser me nahi jaati, aur sirf aap aur aapki team hi AI chala sakte ho.

1. Key banao, koi ek:
   - **Google Gemini (free limit ke saath):** [aistudio.google.com](https://aistudio.google.com) → **Get API key** → **Create API key**
   - **Claude (paid):** [console.anthropic.com](https://console.anthropic.com) → API keys → key banao
2. Vercel → apna project → **Settings → Environment Variables** → Name `AI_API_KEY`, Value me key → **Save**.
3. **Deployments** tab → sabse upar wale deployment ke **⋯ → Redeploy**. (Nayi value tabhi lagti hai.)
4. App me **Settings** kholo, "AI se bill padhna" me **Chalu** dikhega.

Model ka naam badalna ho to `AI_MODEL` variable daalo. Khaali chhodo to Gemini me `gemini-3.8-flash` aur Claude me `claude-sonnet-5-5` chalta hai.

## Google Sheet aur Drive me save (optional)

Ye chalu karne ke baad:

- Har entry **"Saman"** sheet me ek line ban jaati hai. Save, edit ya delete karte hi Sheet bhi badal jaati hai.
- Kisko diya, wapas aaya, kharab aur return **"Kisko diya"** sheet me likhe jaate hai.
- Har bill ki photo/PDF aapke Google Drive ke **"Office Saman Register - Bills"** folder me mahine ke hisaab se (jaise `2026-10`) save hoti hai, naam jaise `2026-10-13 - INV-123 - Amazon.jpg`. Sheet ke "Bill (Drive)" column me click karne layak link hota hai.

**Lagane ka tareeka (lagbhag 10 minute):**

1. Jis Google account me bill chahiye, usse [sheets.new](https://sheets.new) kholo. Nayi Sheet ka naam rakho, jaise `Office Saman Register`.
2. Sheet me **Extensions → Apps Script** kholo. Jo code dikhe (`function myFunction…`) sab hata do, aur is project ki `google-apps-script/Code.gs` file ka poora text paste karo. **Save** (💾) dabao.
3. Upar function wale dropdown me **setup** chuno aur **Run** dabao. Permission maangega: **Review permissions** → apna account chuno. "Google hasn't verified this app" aaye to **Advanced → Go to … (unsafe) → Allow**. Ye aapka apna script hai, isliye ye warning aana normal hai.
4. Neeche **Execution log** me `GOOGLE_SCRIPT_SECRET = …` wali lambi line aayegi. Wo secret copy karo. (Baad me bhi Sheet me **Office Register → Setup / secret dikhao** menu se mil jayega.)
5. **Deploy → New deployment** dabao. Gear icon se **Web app** chuno. **Execute as: Me**, **Who has access: Anyone** rakho, phir **Deploy** dabao. **Web app URL** copy karo (`https://script.google.com/macros/s/…/exec`).
   - "Anyone" zaroori hai taaki aapka Vercel server ise chala sake. Secret ke bina koi ise kuch nahi kara sakta.
6. Vercel → apna project → **Settings → Environment Variables** me do value daalo:
   - `GOOGLE_SCRIPT_URL` = Web app URL
   - `GOOGLE_SCRIPT_SECRET` = Step 4 wala secret

   **Save** karo, phir **Deployments → ⋯ → Redeploy**.
7. App me **Settings** kholo. "Google Sheet aur Drive" me **Chalu** dikhega. Ek baar **Saari entries Sheet me dobara bhejo** dabao, taaki purani entries aur unke bill bhi chale jaye.
8. Team ko bill dikhane hai to Drive me "Office Saman Register - Bills" folder **Share** karo. Sheet bhi share kar sakte ho (View only theek rahega).

**Dhyan rakhne wali baatein:**

- Sheet sirf **copy** hai. Sheet me kuch badloge to app me nahi aayega. Badlav app me hi karo.
- Bill app me bhi rehta hai (jaldi dikhane aur AI ke liye) aur Drive me bhi.
- Bill hataoge ya entry delete karoge to Drive wali file Drive ke **Trash** me jaati hai (30 din tak wapas la sakte ho).
- Net nahi tha to app ye badlav yaad rakhta hai aur net aate hi Sheet me bhej deta hai.
- `Code.gs` kabhi badla to: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. URL wahi rehta hai.

## Login aur suraksha

- App kholte hi **Google se sign in** maangta hai. Bina login ke kuch nahi dikhta.
- Default me login sirf us browser tab tak rehta hai. Tab ya browser band kiya, to agli baar dobara login maangega.
- Login page pe **"Is phone/computer pe login yaad rakho"** tick karoge to us device pe login bana rahega. Ye sirf apne khud ke phone ya computer pe karna, office ke saajhe computer pe nahi.
- Menu me **Logout** se kabhi bhi register band kar sakte ho.
- Andar sirf **owner** (jiska Gmail `firestore.rules` me hai) aur **Settings → Team** me jode gaye Gmail wale aa sakte hai. Koi aur Gmail se login kare to use "Abhi access nahi hai" dikhega aur koi entry nahi dikhegi.

**Ek baar zaroor check karo:** browser ki **Incognito / Private window** me apni website kholo aur kisi aise Gmail se login karo jo Team me nahi hai. "Abhi access nahi hai" aana chahiye. Agar register khul jaye, to Firebase me Step 5 (rules) dobara karo aur `APNA_EMAIL@gmail.com` ki jagah apna Gmail daal ke **Publish** karo.

## Team jodna

App me **Settings → Team** me har line me ek Gmail likho → **Team save karo**. Sirf owner (jiska email rules me hai) team badal sakta hai. Team wale log usi link pe apne Gmail se sign in karenge.

## Zaroori baatein

- **Bill ka size:** har bill 900 KB tak. Photo apne aap chhoti ho jaati hai. PDF 900 KB se badi ho to uski photo ya screenshot lagao.
- **Firebase free limit:** lagbhag 1 GB data aur rozana 50,000 reads / 20,000 writes. Ek office ke liye kaafi hai.
- **Vercel free (Hobby) plan** Vercel ke niyam ke hisaab se sirf personal, non-commercial use ke liye hai. Agar aapka office ise commercial kaam maane, to Vercel ka Pro plan lo ya Vercel Support se pooch lo.
- **Net nahi ho tab bhi:** entry phone me save ho jaati hai aur net aate hi upload ho jaati hai.
- **Backup:** Excel (CSV) button se kabhi bhi poori list download kar lo.

## Apne computer pe chalana (developers ke liye, optional)

```bash
npm install
cp .env.example .env.local   # values bharo
npm run dev                  # http://localhost:3000
```

Firebase me `localhost` pehle se Authorized domains me hota hai.

## Files

| File / folder | Kaam |
|---|---|
| `app/layout.tsx` | Fonts, title, aur login + menu jo har page pe ek baar lagta hai |
| `app/page.tsx`, `app/saman/`, `app/stock/`, `app/kisko-diya/`, `app/hisaab/` | Saare page (Dashboard, list, stock, kisko diya, hisaab) |
| `app/globals.css` | Poora design (light + dark + print) |
| `app/api/read-bill/route.ts` | Server: bill AI ko bhejta hai, member check karta hai |
| `components/` | App ke hisse: `Shell` (login, menu, data), `Dashboard`, `Pages` (list, stock, kisko diya, hisaab), `EntryDrawer`, `EntryPrint` (parchi), form, `Modals` (settings ke hisse) |
| `lib/firebase.ts` | Login aur database ki saari baat-cheet |
| `lib/calc.ts` | Stock, hisaab, filter, tareekh ke formule |
| `lib/bills.ts` | Bill chhota karna, upload, download |
| `app/api/google/route.ts` | Server: app aur Google Sheet script ke beech ka pul |
| `lib/sheet.ts` | Sheet me kaunsi line kaise likhi jaye |
| `lib/sync.ts` | Sheet/Drive me bhejne ki line, net na ho to baad me dobara |
| `google-apps-script/Code.gs` | Google Sheet ke andar chalne wala script |
| `firestore.rules` | Kaun dekh aur likh sakta hai (Step 5) |
| `.env.example` | Kaun-kaun si settings chahiye |

### Data kahan rehta hai

- `purchases/{id}`: ek entry. Fields: `item, category, qty, rate, total, orderDate, receivedDate, vendor, broughtBy, billNo, note, serials, warrantyTill, iPaid, myPaid, myBack, myBackDate, bills[{id,name,type,size,driveId,driveUrl}], issues[{id,date,qty,person,dept,note,by,byName}], moves[{id,date,qty,type: back|damaged|vendor,note}], addedBy, addedByName, createdAt, updatedAt`
- `bills/{id}`: bill ki file (`data` bytes, `type`, `name`, `size`). Entry ke `bills[]` me Drive ki `driveId`, `driveUrl` bhi rehti hai.
- `settings/stock`: `{ min: { "<saman ka naam>": number } }`
- `config/access`: `{ emails: [...] }` team list

Next.js 16, React 19, Firebase JS SDK 12, TypeScript.
