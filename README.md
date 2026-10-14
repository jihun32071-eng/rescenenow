# RESCENE NOW

리센느 영상·일정·소식을 모은 비공식 팬 사이트입니다. GitHub Pages와 GitHub Actions에서 운영하며 개인 컴퓨터를 켜 둘 필요가 없습니다.

사이트: https://jihun32071-eng.github.io/rescenenow/

## 구성

- `site/`: 웹 화면, 멤버 사진, 영상 목록과 일정, APK
- `backend/`: 서버에서 실행할 기존 수집 코드와 저장된 수집 상태
- `refresh.mjs`: 영상·소식·공식 일정 갱신과 저장
- `.github/workflows/update.yml`: 30분 간격 갱신, 저장, Pages 배포

방문자가 없어도 GitHub 서버에서 수집합니다. 내 컴퓨터와 터널은 필요하지 않습니다. 실패한 공급원의 기존 자료와 확인 시각은 보존하며, 확인되지 않은 시각을 오늘로 바꾸지 않습니다. 웹의 새로고침 버튼은 최근 서버 저장본을 다시 읽습니다.

## 운영

기본 브랜치는 `main`입니다. Pages 게시 소스는 GitHub Actions입니다. 화면·코드를 수정해 올리면 갱신·배포 workflow가 실행됩니다. 즉시 새 자료를 수집하려면 **Actions → Update RESCENE NOW → Run workflow**를 실행합니다.

웹의 ‘브라우저 앱 설치’를 사용하면 휴대폰에서도 이 클라우드 사이트를 앱으로 열 수 있습니다. 포함된 APK는 휴대폰에서 자료를 직접 수집하는 기존 독립 앱이며 Pages 예약 갱신과 별도로 동작합니다.

무료 Pages는 공개 저장소를 사용합니다. 기존 홈페이지 자료와 수집 코드도 공개 저장소에 들어갑니다. 비밀번호·인증 토큰·APK 서명 키는 이 배포본에 포함하지 않습니다.

## 갱신 주기와 확인

영상·뉴스·공식 일정은 매시 7분과 37분에 확인하도록 설정했습니다. 과거 영상 목록은 기존 24시간 확인 상태를 이어받습니다. 예약 실행은 GitHub 상황에 따라 지연되거나 누락될 수 있어 정확히 30분마다 갱신을 보장하지 않습니다. 마지막 확인 후 90분이 지나면 화면에 오래된 목록임을 표시합니다.

오랫동안 저장소 활동이 없는 공개 저장소는 60일 후 예약 실행이 비활성화될 수 있습니다. Actions에서 workflow 상태를 확인하고 다시 활성화할 수 있습니다. 사이트가 보여주는 확인 시각과 Actions 실행 결과로 실제 갱신 상태를 확인하세요.

갱신 결과를 저장소에 저장한 뒤 같은 workflow에서 바로 배포하므로, 다음 실행에서도 기존 영상과 일정, 수집 상태가 유지됩니다. `backend/`는 Pages에 공개되는 웹 파일로 배포하지 않습니다.

## 공식 안내

- [GitHub Pages 무료 이용과 게시](https://docs.github.com/en/pages/quickstart)
- [Pages Actions 배포](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [공개 저장소의 Actions 요금](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [예약 실행과 지연](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
