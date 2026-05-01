export const ACCEPTED_SUBMISSION_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

export type AcceptedSubmissionType = (typeof ACCEPTED_SUBMISSION_TYPES)[number];

export function isAcceptedSubmissionFile(file: File): boolean {
  return (ACCEPTED_SUBMISSION_TYPES as readonly string[]).includes(file.type);
}

export function partitionFilesByAccepted(files: File[] | FileList): {
  accepted: File[];
  rejected: File[];
} {
  const accepted: File[] = [];
  const rejected: File[] = [];
  const arr = Array.isArray(files) ? files : Array.from(files);
  for (const f of arr) {
    if (isAcceptedSubmissionFile(f)) {
      accepted.push(f);
    } else {
      rejected.push(f);
    }
  }
  return { accepted, rejected };
}
