// Browser-only Sonar API client — do not import in server-side code.
// Sonar is on a private network; only reachable from browsers on the company VPN.

const SONAR_BASE = 'https://sonar.sustvest.in/api/v1';
const TOKEN_KEY = 'sonar_auth_token';

export const getSonarToken = (): string | null =>
  typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;

export const setSonarToken = (token: string): void =>
  localStorage.setItem(TOKEN_KEY, token.trim());

export function decodeTokenExpiry(token: string): Date | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

// All call recordings happen in IST. Convert a "YYYY-MM-DD" date string
// (IST) into UTC boundaries so Sonar's created_at filters are accurate.
function istDayBounds(date: string): { start: string; end: string } {
  return {
    start: new Date(`${date}T00:00:00+05:30`).toISOString(),
    end:   new Date(`${date}T23:59:59+05:30`).toISOString(),
  };
}

export const TASK_TITLES = [
  'KYC_DROP_OFF',
  'PAYMENT_DROP_OFF',
  'KRA_MODIFICATIONS',
  'KYC_VERIFICATION',
  'USER_CALLBACK_REQUESTED',
  'USER_SIGNED_UP',
  'USER_CALLED',
  'NSE_USER_CREATION',
  'PA_FUND_PAYING_PENDING',
  'INITIATE_RFQ_SECURITY_PAYING',
  'RFQ_SECURITY_PAYING_PENDING',
] as const;

export type TaskTitle = typeof TASK_TITLES[number];

export interface SonarOwner {
  id: string;
  name: string;
  email: string;
}

export interface SonarTask {
  id: string;
  title: string;
  phoneNumber?: string;
  task_ownerId?: string;
  task_ownerName?: string;
}

export interface SonarRecording {
  callId: string;
  agentName: string;
  direction: 'INBOUND' | 'OUTBOUND';
  startedAt: string;
  answeredAt: string | null;
  endedAt: string;
  durationSecs: number;
  signedUrl: string;
}

// Enriched recording — recording data merged with parent task context
export interface ScanRecording {
  sonarCallId: string;
  sonarTaskId: string;
  sonarTaskName: string;
  signedUrl: string;
  durationSecs: number;
  direction: 'INBOUND' | 'OUTBOUND';
  startedAt: string;
  answeredAt: string | null;
  customerPhone: string | null;
}

function headers(token: string): Record<string, string> {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function paginateTasks(
  token: string,
  filters: object[],
): Promise<SonarTask[]> {
  const all: SonarTask[] = [];
  let page = 0;
  while (true) {
    const res = await fetch(`${SONAR_BASE}/get-all-tasks`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        currentPage: page,
        pageSize: 50,
        sortBy: 'created_at',
        sortDir: 'DESC',
        filters,
      }),
    });
    if (res.status === 401) throw new Error('401');
    if (!res.ok) throw new Error(`Sonar tasks failed: ${res.status}`);
    const data = await res.json();
    const results: SonarTask[] = data.data?.results ?? [];
    all.push(...results);
    if (results.length < 50) break;
    page++;
  }
  return all;
}

export async function fetchOwners(token: string): Promise<SonarOwner[]> {
  const res = await fetch(`${SONAR_BASE}/get-all-owners`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ pageSize: 100, searchPhrase: '' }),
  });
  if (res.status === 401) throw new Error('401');
  if (!res.ok) throw new Error(`Sonar owners failed: ${res.status}`);
  const data = await res.json();
  return data.data?.results ?? [];
}

// Fetch all tasks assigned to a specific RM on a given IST date.
export async function fetchTasksForOwnerOnDate(
  token: string,
  ownerId: string,
  date: string,
): Promise<SonarTask[]> {
  const { start, end } = istDayBounds(date);
  return paginateTasks(token, [
    { field: 'task_owner_id', operation: 'EQUALS',                 value: ownerId },
    { field: 'created_at',   operation: 'GREATER_THAN_OR_EQUALS', value: start },
    { field: 'created_at',   operation: 'LESSER_THAN_OR_EQUALS',  value: end },
  ]);
}

// Fetch all tasks matching one or more task types on a given IST date.
// Returns tasks across all RMs — group by task_ownerId to split per RM.
export async function fetchTasksByTypeOnDate(
  token: string,
  taskNames: string[],
  date: string,
): Promise<SonarTask[]> {
  const { start, end } = istDayBounds(date);
  return paginateTasks(token, [
    { field: 'task_name',  operation: 'IN',                       value: taskNames },
    { field: 'created_at', operation: 'GREATER_THAN_OR_EQUALS',   value: start },
    { field: 'created_at', operation: 'LESSER_THAN_OR_EQUALS',    value: end },
  ]);
}

export async function fetchRecordingsForTask(
  token: string,
  taskId: string,
): Promise<SonarRecording[]> {
  const res = await fetch(`${SONAR_BASE}/call/task/${taskId}/recordings`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (res.status === 404) return [];
  if (res.status === 401) throw new Error('401');
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data ?? []);
}

// Shared helper: given a list of tasks, fetch all their recordings in parallel
// batches of 5 and return enriched ScanRecording objects.
export async function fetchRecordingsForTasks(
  token: string,
  tasks: SonarTask[],
  onProgress?: (fetched: number, total: number) => void,
): Promise<ScanRecording[]> {
  const all: ScanRecording[] = [];
  const BATCH = 5;

  for (let i = 0; i < tasks.length; i += BATCH) {
    const batch = tasks.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(task =>
        fetchRecordingsForTask(token, task.id).then(recs =>
          recs.map((r): ScanRecording => ({
            sonarCallId:   r.callId,
            sonarTaskId:   task.id,
            sonarTaskName: task.title,
            signedUrl:     r.signedUrl,
            durationSecs:  r.durationSecs,
            direction:     r.direction,
            startedAt:     r.startedAt,
            answeredAt:    r.answeredAt,
            customerPhone: task.phoneNumber ?? null,
          }))
        )
      )
    );
    all.push(...results.flat());
    onProgress?.(Math.min(i + BATCH, tasks.length), tasks.length);
  }
  return all;
}
