'use client';

import React, { useCallback, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { motion } from 'motion/react';
import { X, Check, ZoomIn, RotateCw } from 'lucide-react';

interface Props {
  open: boolean;
  src: string;              // base64 data URL of the picked image
  aspect?: number;          // 1 for square avatar, 16/9 for banner, etc.
  onCancel: () => void;
  onConfirm: (croppedBase64: string) => void;
}

// Loads an image from a data URL and returns a cropped + resized JPEG
// (base64, no data-url prefix so it matches the existing avatar format).
async function getCroppedBase64(
  src: string,
  crop: Area,
  rotation: number,
  outputSize = 512,
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });

  // Rotation-aware bounding box.
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bw = img.width * cos + img.height * sin;
  const bh = img.width * sin + img.height * cos;

  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas context');

  // Fill white so transparent areas of a rotated image are not black.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, outputSize, outputSize);

  const scaleX = outputSize / crop.width;
  const scaleY = outputSize / crop.height;

  ctx.save();
  // Move to canvas center, apply rotation, then the crop offset.
  ctx.translate(outputSize / 2, outputSize / 2);
  ctx.rotate(rad);
  ctx.translate(
    -(crop.x + crop.width / 2) * scaleX,
    -(crop.y + crop.height / 2) * scaleY,
  );
  ctx.scale(scaleX, scaleY);
  // Compensate the extra bounding box offset.
  ctx.translate(-(bw - img.width) / 2, -(bh - img.height) / 2);
  ctx.drawImage(img, 0, 0);
  ctx.restore();

  // Return the full data URL so callers can drop it straight into an
  // <img src> (existing avatars in the app are stored this way too).
  return canvas.toDataURL('image/jpeg', 0.92);
}

export default function ImageCropModal({
  open,
  src,
  aspect = 1,
  onCancel,
  onConfirm,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setArea(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!area) return;
    setSaving(true);
    try {
      const base64 = await getCroppedBase64(src, area, rotation);
      onConfirm(base64);
    } catch (e) {
      console.error('crop failed', e);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black z-[120] flex flex-col select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900">
        <button
          onClick={onCancel}
          className="p-2 -ml-2 rounded-full text-zinc-300 hover:text-white active:scale-90 transition-all"
        >
          <X className="h-5 w-5" />
        </button>
        <p className="text-sm font-semibold text-white">Crop</p>
        <button
          onClick={handleConfirm}
          disabled={saving || !area}
          className="p-2 -mr-2 rounded-full text-[#00D4FF] hover:text-white active:scale-90 transition-all disabled:opacity-40"
        >
          <Check className="h-5 w-5" />
        </button>
      </div>

      {/* Cropper */}
      <div className="relative flex-1 bg-black">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={onCropComplete}
          showGrid={false}
          objectFit="contain"
        />
      </div>

      {/* Controls */}
      <div className="px-5 py-4 bg-zinc-950 border-t border-zinc-900 space-y-4">
        {/* Zoom */}
        <div className="flex items-center gap-3">
          <ZoomIn className="h-4 w-4 text-zinc-500 shrink-0" />
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="flex-1 accent-[#00D4FF]"
          />
        </div>

        {/* Rotate */}
        <div className="flex items-center gap-3">
          <RotateCw className="h-4 w-4 text-zinc-500 shrink-0" />
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={rotation}
            onChange={(e) => setRotation(parseInt(e.target.value, 10))}
            className="flex-1 accent-[#00D4FF]"
          />
          <span className="text-[10px] font-mono text-zinc-500 w-10 text-right">
            {rotation}°
          </span>
        </div>
      </div>
    </motion.div>
  );
}
