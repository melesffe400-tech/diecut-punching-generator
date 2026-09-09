# Random Die-Cut Generator

업로드한 이미지에 랜덤 펀칭을 만들고, 잘려 나온 조각을 아래에 흩뿌려 PNG로 저장하는 브라우저 전용 도구입니다.

## GitHub Pages에 올리기

1. 새 GitHub 저장소를 만듭니다.
2. `index.html`, `style.css`, `script.js`를 저장소 최상위에 업로드합니다.
3. GitHub 저장소의 **Settings → Pages**로 이동합니다.
4. **Deploy from a branch**를 선택합니다.
5. Branch를 `main`, 폴더를 `/ (root)`로 지정하고 저장합니다.
6. 잠시 뒤 생성된 GitHub Pages 주소로 접속하면 됩니다.

## 특징

- 서버/API 불필요
- 업로드 이미지는 브라우저 안에서만 처리
- 물방울 / 원 / 마름모 / 별 펀칭
- 개수, 크기, 흩뿌림 높이, 회전, 여백 조절
- 원본 펀칭 ON/OFF
- 펀칭 배경: 종이색 / 흰색 / 투명
- PNG 다운로드

## 파일 구조

- `index.html` — 화면 구조
- `style.css` — 디자인
- `script.js` — 이미지 처리 및 Canvas 렌더링
