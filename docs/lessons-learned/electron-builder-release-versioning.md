# electron-builder 릴리스 Draft 및 버전 번호 미증가 문제

## 증상
- GitHub 릴리스가 항상 **Draft**로 생성됨
- 같은 날 여러 빌드를 해도 버전 번호가 증가하지 않음 (예: `2026.329.0`이 반복)

## 원인

### 1. Draft 릴리스
- `electron-builder`의 GitHub publish provider는 **기본적으로 draft 릴리스를 생성**한다.
- `--publish always`는 "항상 업로드 시도"라는 의미이지, "published 릴리스로 생성"이라는 의미가 아님.
- `releaseType: "release"` 설정이 별도로 필요함.

### 2. 버전 번호 미증가
두 가지 하위 원인:

**semver leading zero 제거:**
- `printf '%02d%02d' 3 29` → `0329`
- `npm version 2026.0329.0` → semver 규칙에 의해 `2026.329.0`으로 변환 (leading zero 불허)

**COUNT 검색 패턴 불일치:**
- `gh release list | grep "^2026-03-29"` → 날짜 형식으로 검색
- 실제 릴리스 태그는 `v2026.329.0` 형식 → 매칭 실패 → COUNT 항상 0

## 해결

### package.json
```json
"publish": [
  {
    "provider": "github",
    "releaseType": "release"
  }
]
```

### release-win.yml
```bash
# leading zero 없는 실제 semver 형식으로 검색
MMDD_NUM=$((MONTH * 100 + DAY))
COUNT=$(gh release list --limit 100 | grep -c "${YEAR}\.${MMDD_NUM}\." || true)
```

## 교훈
- `--publish always`와 `releaseType`은 별개 설정이다. electron-builder 문서를 정확히 확인할 것.
- semver는 각 부분(MAJOR.MINOR.PATCH)에 leading zero를 허용하지 않는다. 날짜 기반 버전 생성 시 이 변환을 반드시 고려해야 한다.
