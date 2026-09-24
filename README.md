# Daily Ref

나만 보는 경제 · 부동산 · 디자인 · 뉴스레터 레퍼런스 아카이브.

- 화면: GitHub Pages (이 저장소)
- 데이터 · 로그인 · 이미지: Supabase (RLS로 본인만 접근)
- Gmail `ref` 라벨 → 자동 수집: Google Apps Script (다음 단계)

## 파일
| 파일 | 역할 |
|---|---|
| `index.html` | 화면 구조 (로그인 화면 + 앱 화면) |
| `styles.css` | 디자인 토큰과 스타일 (Frip 디자인 시스템 기반) |
| `app.js` | 동작 (로그인, 불러오기, 저장, 검색) |
| `config.js` | Supabase 주소와 공개용 키, Google 로그인 스위치 |

`config.js`에는 공개용(publishable) 키만 넣습니다. secret / service_role 키는 절대 이 저장소에 올리지 마세요.
