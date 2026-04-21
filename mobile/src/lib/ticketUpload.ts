import * as ImagePicker from 'expo-image-picker';
import { FLORIDA_GAMES, type GameType } from '@florida-lotto/shared';
import { API_TIMEOUT_MS, API_URL, UPLOAD_SESSION_TOKEN } from './env';
import { getMobileAuthToken } from './mobileAuthToken';
import type { ManualTicketDraft } from './ticketImport';

function getUploadAuthToken() {
  return getMobileAuthToken() ?? UPLOAD_SESSION_TOKEN;
}

export function hasTicketUploadAuth() {
  return Boolean(getUploadAuthToken());
}

export type TicketImageSource = 'camera' | 'library';

export type SelectedTicketImage = {
  base64: string;
  fileName: string;
  uri: string;
  width: number;
  height: number;
};

export type UploadedTicketResponse = {
  ticketId: number;
  extracted: {
    gameType: GameType;
    gameName: string;
    drawDate: string;
    drawTime: 'midday' | 'evening';
    mainNumbers: number[];
    specialNumbers: number[];
  };
  matchedModel: string | null;
  evaluatedNow: boolean;
  imageUrl: string;
  ocrConfidence?: {
    score: number;
    fieldsExpected: number;
    fieldsParsed: number;
  };
};

function createFileName(asset: ImagePicker.ImagePickerAsset) {
  if (asset.fileName && asset.fileName.trim()) {
    return asset.fileName.trim();
  }

  const suffix = asset.uri.split('/').pop();
  return suffix && suffix.includes('.') ? suffix : `ticket-photo-${Date.now()}.jpg`;
}

async function ensurePermission(source: TicketImageSource) {
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error(source === 'camera'
      ? 'Camera permission is required to capture a ticket image.'
      : 'Photo library permission is required to choose a ticket image.');
  }
}

export async function selectTicketImage(source: TicketImageSource) {
  await ensurePermission(source);

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 0.85,
    base64: true,
  };
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];

  if (!asset?.base64) {
    throw new Error('The selected image could not be prepared for upload.');
  }

  return {
    base64: asset.base64,
    fileName: createFileName(asset),
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
  } satisfies SelectedTicketImage;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeNumbers(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => typeof item === 'number' ? item : Number(item))
    .filter(item => Number.isFinite(item));
}

function normalizeUploadResponse(value: unknown): UploadedTicketResponse {
  if (!isObject(value) || value.success !== true || !isObject(value.extracted)) {
    throw new Error('The scan response could not be mapped to a supported ticket structure.');
  }

  const extracted = value.extracted;
  const gameType = typeof extracted.gameType === 'string' ? extracted.gameType as GameType : null;
  const cfg = gameType ? FLORIDA_GAMES[gameType] : null;
  const drawTime = extracted.drawTime === 'midday' || extracted.drawTime === 'evening'
    ? extracted.drawTime
    : null;
  const drawDate = typeof extracted.drawDate === 'string' ? extracted.drawDate : null;
  const mainNumbers = normalizeNumbers(extracted.mainNumbers);
  const specialNumbers = normalizeNumbers(extracted.specialNumbers);

  if (!gameType || !cfg || !drawDate || !drawTime || mainNumbers.length === 0) {
    throw new Error('The scan response was incomplete. Review the ticket manually before saving.');
  }

  return {
    ticketId: typeof value.ticketId === 'number' ? value.ticketId : Number(value.ticketId),
    extracted: {
      gameType,
      gameName: typeof extracted.gameName === 'string' ? extracted.gameName : cfg.name,
      drawDate,
      drawTime,
      mainNumbers,
      specialNumbers,
    },
    matchedModel: typeof value.matchedModel === 'string' ? value.matchedModel : null,
    evaluatedNow: value.evaluatedNow === true,
    imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : '',
    ocrConfidence: isObject(value.ocrConfidence)
      ? {
        score: Number(value.ocrConfidence.score) || 0,
        fieldsExpected: Number(value.ocrConfidence.fieldsExpected) || 0,
        fieldsParsed: Number(value.ocrConfidence.fieldsParsed) || 0,
      }
      : undefined,
  };
}

export async function uploadTicketImage(image: SelectedTicketImage) {
  const authToken = getUploadAuthToken();

  if (!authToken) {
    throw new Error('Sign in to scan ticket images, or use manual review for this ticket.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}/api/upload-ticket`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: image.fileName,
        fileData: image.base64,
        cost: 0,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null) as unknown;

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Ticket image upload was not authorized. Sign in again, then retry the scan.');
      }

      const message = isObject(body) && typeof body.error === 'string'
        ? body.error
        : 'Ticket image upload failed.';
      throw new Error(message);
    }

    return normalizeUploadResponse(body);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Ticket image upload timed out. Check your connection and try again.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function createDraftFromUploadedTicket(
  upload: UploadedTicketResponse,
  image: SelectedTicketImage,
): ManualTicketDraft {
  return {
    gameType: upload.extracted.gameType,
    mainNumbersText: upload.extracted.mainNumbers.join(' '),
    specialNumbersText: upload.extracted.specialNumbers.join(' '),
    drawDate: upload.extracted.drawDate,
    drawTime: upload.extracted.drawTime,
    notes: [
      'Imported from ticket photo.',
      upload.ocrConfidence
        ? `Scan fields parsed: ${upload.ocrConfidence.fieldsParsed}/${upload.ocrConfidence.fieldsExpected}.`
        : null,
    ].filter(Boolean).join('\n'),
    sourceType: 'uploadedImage',
    sourceLabel: 'Ticket photo',
    originalFileName: image.fileName,
  };
}
