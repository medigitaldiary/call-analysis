const SARVAM_BASE = 'https://api.sarvam.ai/speech-to-text/job/v1';

function sarvamHeaders(contentType = 'application/json') {
  return {
    'api-subscription-key': process.env.SARVAM_API_KEY!,
    'Content-Type': contentType,
  };
}

export async function transcribeAudio(audioUrl: string): Promise<{ text: string; duration: number }> {
  // ── 1. Fetch audio ───────────────────────────────────────────────────────
  const isBlob = audioUrl.includes('vercel-storage.com') || audioUrl.includes('blob.vercel');
  const audioRes = await fetch(audioUrl, isBlob
    ? { headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` } }
    : { redirect: 'follow' }); // follow redirects for Google Drive export URLs
  if (!audioRes.ok) throw new Error(`Failed to fetch audio: ${audioRes.status} ${audioRes.statusText}`);
  const audioBuffer = await audioRes.arrayBuffer();
  const fileName = (audioUrl.split('/').pop()?.split('?')[0] ?? 'audio.mp3');

  // ── 2. Create batch job ──────────────────────────────────────────────────
  const createRes = await fetch(SARVAM_BASE, {
    method: 'POST',
    headers: sarvamHeaders(),
    body: JSON.stringify({
      job_parameters: {
        language_code: 'en-IN',
        model: 'saarika:v2.5',
        mode: 'transcribe',
        with_timestamps: true,
      },
    }),
  });
  if (!createRes.ok) throw new Error(`Sarvam job creation failed: ${await createRes.text()}`);
  const { job_id } = await createRes.json();

  // ── 3. Get presigned upload URL ──────────────────────────────────────────
  const uploadUrlRes = await fetch(`${SARVAM_BASE}/upload-files`, {
    method: 'POST',
    headers: sarvamHeaders(),
    body: JSON.stringify({ job_id, files: [fileName] }),
  });
  if (!uploadUrlRes.ok) throw new Error(`Sarvam upload URL failed: ${await uploadUrlRes.text()}`);
  const { upload_urls } = await uploadUrlRes.json();
  const fileUrl: string = upload_urls[fileName]?.file_url;
  if (!fileUrl) throw new Error(`No upload URL returned for ${fileName}`);

  // ── 4. Upload audio to presigned URL (PUT directly to Azure Blob Storage) ──
  // Azure requires x-ms-blob-type header — without it the PUT is rejected
  const putRes = await fetch(fileUrl, {
    method: 'PUT',
    body: audioBuffer,
    headers: {
      'Content-Type': 'audio/mpeg',
      'x-ms-blob-type': 'BlockBlob',
    },
  });
  if (!putRes.ok) throw new Error(`Sarvam file upload failed: ${putRes.statusText}`);

  // ── 5. Start the job ─────────────────────────────────────────────────────
  const startRes = await fetch(`${SARVAM_BASE}/${job_id}/start`, {
    method: 'POST',
    headers: sarvamHeaders(),
    body: JSON.stringify({}),
  });
  if (!startRes.ok) throw new Error(`Sarvam job start failed: ${await startRes.text()}`);

  // ── 6. Poll until Completed (max 4 min, check every 5s) ─────────────────
  const MAX_WAIT_MS  = 4 * 60 * 1000;
  const POLL_INTERVAL = 5_000;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    const statusRes = await fetch(`${SARVAM_BASE}/${job_id}/status`, {
      headers: { 'api-subscription-key': process.env.SARVAM_API_KEY! },
    });
    if (!statusRes.ok) throw new Error(`Sarvam status check failed: ${statusRes.statusText}`);
    const status = await statusRes.json();

    if (status.job_state === 'Failed') {
      throw new Error(`Sarvam batch job failed: ${status.error_message ?? 'unknown error'}`);
    }

    if (status.job_state === 'Completed') {
      // Transcript is in a separate output file — download it via presigned URL
      const outputFileId: string = status.job_details?.[0]?.outputs?.[0]?.file_id ?? '0.json';

      const dlRes = await fetch(`${SARVAM_BASE}/download-files`, {
        method: 'POST',
        headers: sarvamHeaders(),
        body: JSON.stringify({ job_id, files: [outputFileId] }),
      });
      if (!dlRes.ok) throw new Error(`Sarvam download-files failed: ${dlRes.statusText}`);
      const dlData = await dlRes.json();

      const presignedUrl: string = dlData.download_urls?.[outputFileId]?.file_url;
      if (!presignedUrl) throw new Error('No presigned download URL returned by Sarvam');

      const result = await fetch(presignedUrl).then(r => r.json());
      const text: string = result.transcript ?? '';

      // Duration from last end_time_seconds timestamp
      const endTimes: number[] = result.timestamps?.end_time_seconds ?? [];
      const duration = endTimes.length > 0 ? endTimes[endTimes.length - 1] : 0;

      return { text, duration };
    }

    // Still Accepted / Pending / Running — keep polling
  }

  throw new Error('Sarvam batch transcription timed out after 4 minutes');
}
