# 듀플렉스 ADF 스캐너의 단면 모드 빈 뒷면 아티팩트

> **날짜**: 2026-04-28
> **영향**: 클래식 모드에서 학생 답안 단면 스캔 시 N장 입력 → N+α장 등록 (예: 2장 → 3장)
> **증상**: 사용자 보고 "2장 스캔했는데 3장이 스캔돼". `[Scanner] scan: 번호 접미사 파일 발견: 3 개`로 NAPS2 출력 자체가 3 파일.
> **재현 환경**: Canon imageFORMULA R40 TWAIN 드라이버 + Windows 10/11

---

## 근본 원인

**듀플렉스 ADF 스캐너 + TWAIN 드라이버 기본값이 듀플렉스**인 조합에서, NAPS2가 `--source feeder` (단면)을 보내도 드라이버 단에서 무시하고 양면 스캔이 수행된다. 한 장이 단면 문서이면 빈 뒷면이 별도 페이지로 출력되어 N장 입력에 N + 빈페이지 수 만큼 파일이 생긴다.

NAPS2 자체는 정상 종료(stdout/stderr 비어있음, exit 0)이고 우리 앱 코드도 정상 처리한 결과를 그대로 등록하기 때문에, **NAPS2/앱 레이어에서는 정상 동작으로 보이지만 사용자 입장에선 잘못된 결과**다.

### 실제 관찰 데이터 (Canon R40, 300dpi gray, JPEG)

| 시나리오 | .1.jpg | .2.jpg | .3.jpg |
|---------|--------|--------|--------|
| 빈 페이지가 중간에 | 334,867 b | **76,620 b** | 338,666 b |
| 빈 페이지가 끝에 | 333,338 b | 334,343 b | **76,116 b** |

빈 뒷면 파일은 **정상 페이지 대비 ~22% 수준의 압축 결과** (300dpi gray Letter 빈 페이지가 70-80KB로 압축됨). 위치는 들쭉날쭉하지만 크기 패턴은 일관됨.

---

## 해결: 앱 레이어에서 빈 페이지 휴리스틱 필터

NAPS2/TWAIN/Canon 드라이버 어디서도 강제로 단면을 보장하는 안정적 방법이 없으므로, `scanner-service.ts:scan()`에서 **단면(feeder) 모드 결과**에 한해 빈 뒷면 추정 페이지를 후처리로 제거한다.

```typescript
private filterBlankDuplexBacksides(files: string[], source: string): string[] {
  if (source !== 'feeder' || files.length < 2) return files;

  const sizes = files.map(f => fs.statSync(f).size);
  const maxSize = Math.max(...sizes);

  // 가장 큰 파일이 작으면 (모두 빈 페이지) 필터하지 않음
  if (maxSize < 100 * 1024) return files;

  return files.filter((_, i) => {
    // 절대 < 80KB AND 상대 < max의 30% — 둘 다 만족할 때만 빈 페이지로 판정
    return !(sizes[i] < 80 * 1024 && sizes[i] < maxSize * 0.3);
  });
}
```

**보수적 임계값 설계**:
- **절대값 < 80KB**: Canon R40 실제 아티팩트(~77KB)를 잡되, 정상적인 sparse 답안지(보통 100KB+)는 보존
- **상대값 < 30%**: 모든 페이지가 비슷하게 작은 케이스(legit blank batch)에서 잘못 다 지우는 것 방지
- **`max < 100KB` 가드**: 가장 큰 파일조차 작으면 적용 X (모두 빈 페이지일 가능성)
- **duplex 모드 적용 X**: 사용자가 의도적으로 양면 요청한 거면 빈 뒷면도 보존해야 짝 매칭이 깨지지 않음

---

## 핵심 교훈

| 항목 | 교훈 |
|------|------|
| **하드웨어 기본값은 우리가 통제 못 한다** | NAPS2 CLI 인자(`--source feeder`)가 모든 TWAIN 드라이버에서 강제되지 않는다. 듀플렉스 스캐너는 드라이버 UI에서 사용자가 단면을 기본값으로 설정하지 않는 한 양면을 사용한다 |
| **"NAPS2가 N장 출력"을 신뢰하지 말 것** | NAPS2는 자신이 받은 페이지를 모두 파일로 떨어뜨릴 뿐, 그 페이지가 의미 있는 컨텐츠인지 판정하지 않는다. 듀플렉스 빈 뒷면처럼 "스캐너 입장에선 정상 출력이지만 사용자 입장에선 노이즈"인 페이지가 발생할 수 있다 |
| **휴리스틱은 양방향 임계값으로** | 빈 페이지 판정에 절대값(<80KB) AND 상대값(<max의 30%) 둘 다 요구해야 거짓 양성(sparse 정상 답안)을 줄일 수 있다. 한쪽 조건만 쓰면 엣지 케이스에서 정상 페이지를 잘못 거른다 |
| **워크트리 수정은 메인 저장소에 반영되지 않는다** | `.claude/worktrees/<branch>/`에 적용한 변경은 메인 저장소에서 `npm run electron:dev`로 띄운 빌드와 무관하다. 워크트리에서 수정한 코드를 dev로 검증하려면 워크트리에 `npm install` 후 거기서 띄우거나, 검증 시점에 한해 메인으로 파일을 복사해야 한다 |

---

## 디버깅 시 확인 포인트

1. **콘솔 로그**: `[Scanner] scan: 번호 접미사 파일 발견: N 개`에서 N이 입력 매수보다 큰가?
2. **파일 크기 패턴**: temp 디렉토리(`%TEMP%\ai-exam-grader-scan\`)의 `.1.jpg`, `.2.jpg`, ... 크기를 비교. 어느 한 파일이 다른 파일들의 25% 이하라면 빈 뒷면 의심.
3. **필터 동작 확인**: `[Scanner] scan: 빈 페이지(듀플렉스 뒷면 추정) 제외: <basename> (<size> bytes, max=<maxsize>)` 로그가 찍히는지.
4. **드라이버 UI 권장**: Canon R40 TWAIN 설정 다이얼로그에서 "기본값을 단면으로" 옵션이 있다면 사용자에게 안내. 단, 이 설정은 사용자별/PC별이라 코드 휴리스틱이 여전히 마지막 방어선.

---

## 수정된 파일

- `electron/scanner-service.ts` — `filterBlankDuplexBacksides()` 신규, `scan()`의 primary/fallback 두 경로 모두에 적용
- `electron/__tests__/scanner-service.test.ts` — 빈 페이지 필터 회귀 테스트 6개 추가 (실제 버그 시나리오, duplex 보존, 1개 파일 보존, 모두 작은 사이즈 보존, 80KB 이상 sparse 보존, 절대값 작아도 max 대비 큰 비율 보존)
