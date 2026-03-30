# NAPS2 포터블 모드 크래시 — Program Files 쓰기 권한 문제

> **날짜**: 2026-03-29
> **영향**: 데스크탑 앱에서 스캐너 디바이스를 전혀 감지하지 못함
> **증상**: `fetchDevices`가 `{"devices":[]}` 반환, UI에 "디바이스 없음" 표시

---

## 근본 원인

NAPS2 Portable ZIP에 포함된 `NAPS2.Portable.exe` 마커 파일이 원인이었다.

### NAPS2의 데이터 디렉토리 결정 로직

```
1. NAPS2.Portable.exe 존재? → 포터블 모드 → {exe_dir}/../Data/ 사용 (NAPS2_DATA 무시)
2. NAPS2.Portable.exe 없음? → NAPS2_DATA 환경변수 확인 → 해당 경로 사용
3. 둘 다 없으면 → AppData 사용
```

### 왜 크래시가 발생했나

1. `electron-builder`가 `resources/naps2/` 전체를 `C:\Program Files\Gradely\resources\naps2\`에 설치
2. `NAPS2.Portable.exe`가 포함됨 → NAPS2가 포터블 모드로 동작
3. 포터블 모드에서 `C:\Program Files\...\naps2\Data\recovery\`에 쓰기 시도
4. `C:\Program Files\`는 일반 사용자에게 읽기 전용 → `UnauthorizedAccessException` 크래시

### 왜 에러가 UI에 표시되지 않았나

`listDevices()`가 `permission` 타입 에러만 상위로 전파하고, `timeout`/`unknown` 타입은 버렸다. NAPS2 크래시가 `unknown`으로 분류되어 최종 반환에서 에러 정보가 사라졌다.

---

## 해결

### 빌드 타임 (신규 설치 방지)

`scripts/download-naps2.mjs`에서 `Data/` 삭제와 함께 `NAPS2.Portable.exe`도 삭제:

```js
const portableExe = path.join(DEST_DIR, 'NAPS2.Portable.exe');
if (fs.existsSync(portableExe)) {
  fs.rmSync(portableExe);
}
```

### 런타임 (기존 설치 대응)

`C:\Program Files\`는 일반 사용자가 수정 불가하므로, 쓰기 가능한 위치에 경량 복사본 생성:

```
{userData}/naps2-app/App/NAPS2.Console.exe  ← 원본에서 복사 (~160KB)
{userData}/naps2-app/App/appsettings.xml    ← 원본에서 복사
{userData}/naps2-app/App/lib/               ← 원본 lib/로의 디렉토리 정션 (151MB 복사 회피)
```

- `NAPS2.Portable.exe`가 없으므로 비포터블 모드 → `NAPS2_DATA` 환경변수 정상 작동
- 디렉토리 정션(junction)은 Windows 10에서 관리자 권한 없이 생성 가능

---

## 추가 발견: Data/ 디렉토리 재생성 문제 (2026-03-30)

### 증상

`NAPS2.Portable.exe` 제거와 `download-naps2.mjs`의 `Data/` 삭제가 적용된 후에도, 운영 빌드에서 동일한 `UnauthorizedAccessException` 권한 에러 재발.

### 원인

1. 개발 모드에서 NAPS2를 실행하면 `resources/naps2/Data/`가 **다시 생성**됨 (debuglog, recovery, temp 등)
2. `electron-builder`의 `extraResources` 필터가 `"**/*"`로 설정 → 재생성된 `Data/`가 프로덕션 빌드에 포함
3. `C:\Program Files\Gradely\resources\naps2\Data\`가 존재 → NAPS2가 `NAPS2_DATA` 환경변수 대신 로컬 `Data/`에 쓰기 시도 → 권한 에러

즉, `NAPS2.Portable.exe` 없이도 **`Data/` 디렉토리 자체가 존재하면** NAPS2가 그곳에 쓰기를 시도한다.

### 해결

`package.json`의 `extraResources` 필터에서 `Data/` 제외:

```json
"extraResources": [{
  "from": "resources/naps2",
  "to": "naps2",
  "filter": ["**/*", "!Data", "!Data/**"]
}]
```

이렇게 하면 개발 중 `Data/`가 재생성되더라도 프로덕션 빌드에는 포함되지 않는다.

---

## 교훈

### 1. 포터블 앱의 마커 파일을 주의하라

NAPS2처럼 포터블/설치 모드를 마커 파일로 구분하는 앱을 번들링할 때, 마커 파일이 의도치 않게 포함되면 동작이 완전히 달라진다. `Data/` 디렉토리만 삭제하는 것으로는 부족했다 — `NAPS2.Portable.exe`가 있으면 NAPS2가 `Data/`를 다시 생성하려 시도한다.

### 2. `C:\Program Files\` 쓰기 불가를 항상 가정하라

Electron 앱이 `Program Files`에 설치되면 앱 디렉토리 내에 런타임 데이터를 쓸 수 없다. 번들링된 서드파티 도구도 마찬가지. 데이터 디렉토리는 반드시 `userData`(`%APPDATA%`) 또는 `temp`를 사용해야 한다.

### 3. 에러를 조용히 삼키지 마라

`listDevices()`가 non-permission 에러를 버린 것이 디버깅을 어렵게 만들었다. 사용자에게는 "디바이스 없음"으로만 표시되었고, 실제로는 NAPS2 크래시가 발생하고 있었다. **모든 에러 타입을 반환값에 포함**하도록 수정하여 UI에서 적절한 안내를 표시할 수 있게 했다.

### 4. 디렉토리 정션은 대용량 복사의 대안

151MB의 `lib/` 디렉토리를 복사하는 대신 디렉토리 정션을 사용하면 디스크 공간과 시간을 절약할 수 있다. Windows 10 이상에서 `New-Item -ItemType Junction`은 관리자 권한 없이 동작한다 (심볼릭 링크와 다름).

### 5. 직접 실행해서 검증하라

코드만 읽어서는 원인을 알 수 없었다. NAPS2를 직접 실행하고 stdout/stderr를 분리해서 확인한 것이 핵심이었다:

```bash
NAPS2.Console.exe --listdevices --driver twain 1>stdout.txt 2>stderr.txt
# → stderr에 UnauthorizedAccessException 확인
```

### 6. 빌드 타임 삭제만으로는 부족하다 — 빌드 필터로 방어하라

`download-naps2.mjs`에서 `Data/`를 삭제해도, 개발 중 NAPS2 실행으로 다시 생성된다. **빌드 스크립트의 삭제 + `extraResources` 필터 제외**를 함께 적용해야 확실하다. 삭제는 "생성 방지"이고, 필터는 "혹시 생성되어도 번들 제외"라는 이중 방어선이다.
