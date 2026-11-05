
export type AttachmentType = 'file' | 'image';

export type AttachmentStatus =
  | 'selected'
  | 'uploading'
  | 'success'
  | 'error';

export interface ChatAttachment {
  id: string;

  name: string;

  type: AttachmentType;

  mimeType: string;

  size: number;

  /**
   * 本地预览 URL。
   * 图片使用 object URL。
   */
  previewUrl?: string;

  /**
   * 服务端上传成功后的 URL。
   */
  url?: string;

  status: AttachmentStatus;

  /**
   * 上传失败时的错误信息。
   */
  error?: string;
}

/**
 * 附件的本地状态。
 *
 * File 不放进 ChatMessagePayload 的序列化数据中，
 * 而是在 Composer 内部单独维护。
 */
export interface LocalAttachment {
  attachment: ChatAttachment;
  file: File;
}

export interface AttachmentOptions {
  multiple?: boolean;

  maxFiles?: number;

  maxSize?: number;

  accept?: string;
}
