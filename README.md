# Warsztat: wspólny dostęp PIN-em

Strona statyczna. Jeden wspólny PIN (6 cyfr), wspólne projekty oraz osobne konto administratora (e-mail i hasło w Supabase Auth). Konto administratora służy wyłącznie do ustawień. Pierwszy PIN ustawia administrator; nie ma domyślnego PIN-u.

## Wdrożenie w istniejącym Supabase

1. W SQL Editor uruchom cały plik `supabase/migrations/202611170001_workspace.sql` (jednorazowo). Alternatywnie zastosuj migrację przez Supabase CLI po połączeniu projektu. Powstają nowe tabele `workspace_*`; stara tabela `projects` nie jest migrowana ani usuwana. Jej dotychczasowe reguły dostępu pozostają bez zmian. Jeśli zawiera dane, sprawdź osobno jej RLS i zdecyduj o przeniesieniu danych.
2. W Authentication → Users utwórz konto administratora z e-mailem, silnym hasłem i potwierdzonym adresem (opcja Auto Confirm User). Nie włączaj publicznej rejestracji, jeśli nie jest potrzebna. Nie publikuj hasła ani klucza service_role.
3. Nadaj temu kontu uprawnienia w SQL Editor (podstaw jego UUID z Authentication → Users):

   ```sql
   insert into public.workspace_admins (user_id)
   values ('UUID-KONTA-ADMINISTRATORA');
   ```

4. Zaloguj Supabase CLI na swoim komputerze i połącz projekt:

   ```sh
   supabase login
   supabase link --project-ref pxmasspzretdgribwfgn
   supabase secrets set ALLOWED_ORIGINS=https://TWOJA-DOMENA
   supabase functions deploy workspace-api --no-verify-jwt
   ```

   `ALLOWED_ORIGINS` musi zawierać dokładny origin strony, bez końcowego ukośnika i bez ścieżki. Można podać kilka adresów oddzielonych przecinkami, np. `https://example.com,http://localhost:8000`. Dla GitHub Pages z adresem `https://uzytkownik.github.io/repo/` użyj `https://uzytkownik.github.io`.

   Funkcja korzysta ze standardowych sekretów Supabase `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` dostępnych po stronie Edge Functions. Klucz serwerowy nigdy nie trafia do strony. Wyłączenie bramkowej weryfikacji JWT jest celowe: funkcja samodzielnie sprawdza sesję PIN lub token administratora dla każdej chronionej operacji. Sam CORS nie stanowi zabezpieczenia API.
5. Opublikuj pliki strony na dotychczasowym hostingu. `database.js` zawiera wyłącznie URL i publiczny klucz publishable.
6. Na stronie wybierz **Ustawienia administratora**, zaloguj się utworzonym kontem i ustaw pierwszy PIN. Zamknij ustawienia i otwórz warsztat PIN-em.

Lokalny podgląd: `python -m http.server 8000` w katalogu projektu (dodaj `http://localhost:8000` do ALLOWED_ORIGINS). Strona wymaga HTTP(S), nie otwieraj jej przez file://.

## Zasady dostępu

- PIN sprawdzany jest w bazie przez funkcję dostępną tylko dla service_role. Przechowywany jest skrót bcrypt, nie jawny PIN.
- Po 5 błędnych próbach obowiązuje minutowa blokada dla całej przestrzeni, również przy równoległych żądaniach. Wspólna blokada oznacza, że próby jednej osoby mogą chwilowo zablokować pozostałych.
- Sesja robocza trwa maksymalnie 8 godzin. Losowy token znajduje się w sessionStorage karty; baza przechowuje tylko jego SHA-256. Zmiana PIN-u usuwa wszystkie sesje. Kolejne żądanie starej sesji zostanie odrzucone; otwarte wcześniej dane mogą pozostać widoczne w przeglądarce do jej zablokowania/odświeżenia.
- Ustawienia wymagają poprawnego tokenu Supabase Auth i wpisu w `workspace_admins`. Samo konto Supabase nie wystarcza. Sesja administratora jest w pamięci; zamknięcie okna ustawień wylogowuje ją lokalnie.
- Przeglądarka nie ma bezpośredniego dostępu do nowych tabel ani funkcji SQL. Wszystkie operacje na wspólnych projektach przechodzą przez Edge Function i sprawdzają sesję.
- Statyczny HTML, CSS i kod kalkulatora pozostają publiczne. Chronione są dostęp do wspólnych danych i operacje; ukrycie interfejsu nie chroni plików strony.
- Lista pokazuje 100 najnowszych projektów. Zapis tworzy nowy wpis, nie nadpisuje wcześniejszego.

## Sprawdzenie po wdrożeniu

1. Bez PIN-u warsztat jest ukryty; API `list` i `save` bez sesji zwracają 401.
2. Nieprawidłowy PIN nie otwiera warsztatu. Po pięciu błędnych próbach kolejne logowanie zwraca 429 przez minutę.
3. Poprawny PIN pozwala zapisać projekt i odtworzyć jego wymiary (oba tryby, obie jednostki).
4. Druga przeglądarka po tym samym PIN-ie widzi wspólne projekty.
5. Zwykłe konto Auth spoza `workspace_admins` nie może zmienić PIN-u (403).
6. Po zmianie PIN-u stary PIN nie działa, a poprzednie sesje nie mogą pobierać ani zapisywać danych.
7. Bezpośredni odczyt tabel `workspace_*` publicznym kluczem jest niedostępny.

Migracja i funkcja wymagają wdrożenia przed użyciem nowego interfejsu. Weryfikacja lokalna nie zastępuje powyższych prób w docelowej instancji.

## Test interfejsu

```sh
npm install
npx playwright install chromium
npm test
```

Można użyć zainstalowanego Chromium: `CHROMIUM_PATH=/usr/bin/chromium npm test`.
Test korzysta z symulowanych odpowiedzi API i sprawdza blokadę interfejsu, zapis/wczytanie danych, jednostki, sesję po odświeżeniu, odmowę dostępu do ustawień, zmianę PIN-u oraz układ mobilny. Nie sprawdza wdrożenia SQL ani rzeczywistych uprawnień w Supabase.
