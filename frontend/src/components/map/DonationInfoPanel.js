'use client';

import Link from 'next/link';
import { useState } from 'react';
import { assetUrl } from '../../lib/api';
import { formatBangkokDate } from '../../lib/date';

const STATUS_LABELS = {
  AVAILABLE: 'พร้อมรับ',
  OUT_OF_STOCK: 'ของหมดแล้ว',
  EXPIRED: 'หมดช่วงบริจาค',
};

// Donation.category is free text, so tones are matched by keyword; unknown values fall back to a neutral tone.
const CATEGORY_TONES = [
  { tone: 'paper', icon: '📄', keywords: ['กระดาษ', 'หนังสือ', 'paper', 'book'] },
  { tone: 'plastic', icon: '🧴', keywords: ['พลาสติก', 'ขวด', 'plastic', 'bottle'] },
  { tone: 'textile', icon: '👕', keywords: ['เสื้อ', 'ผ้า', 'textile', 'cloth'] },
  { tone: 'metal', icon: '🥫', keywords: ['โลหะ', 'กระป๋อง', 'metal', 'can'] },
  { tone: 'glass', icon: '🫙', keywords: ['แก้ว', 'glass'] },
  { tone: 'electronics', icon: '🔌', keywords: ['อิเล็ก', 'ไฟฟ้า', 'electronic', 'device'] },
];

function categoryTone(category) {
  const value = String(category || '').toLowerCase();
  return CATEGORY_TONES.find(({ keywords }) => keywords.some((keyword) => value.includes(keyword)))
    || { tone: 'default', icon: '🎁' };
}

function PanelImage({ src, alt, className }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <div className={`${className} donationPanelImageFallback`} role="img" aria-label={alt || 'ไม่มีรูปภาพ'}><span>ไม่มีรูปภาพ</span></div>;
  }
  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

export default function DonationInfoPanel({
  donation,
  detail = null,
  loading = false,
  error = '',
  detailHref,
  onClose,
}) {
  const [expanded, setExpanded] = useState(false);
  const data = detail || donation;
  const images = Array.isArray(data.images) ? data.images : [];
  // The DB has no separate place photo, so the first uploaded image is the hero and the rest fill the gallery.
  const coverUrl = images[0] ? assetUrl(images[0].imageUrl) : '';
  const galleryImages = images.slice(1);
  const { tone, icon } = categoryTone(data.category);
  const descriptionLines = (data.description || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const distance = Number(donation.distanceKm);

  return (
    <aside className={`donationPanel${expanded ? ' isExpanded' : ''}`} aria-label="ข้อมูลจุดบริจาค">
      <div className="donationPanelTopbar">
        <button
          type="button"
          className="donationPanelToggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? 'ย่อข้อมูล' : 'ดูข้อมูลเพิ่มเติม'}
        </button>
        <button type="button" className="donationPanelClose" onClick={onClose} aria-label="ปิดข้อมูลจุดบริจาค">×</button>
      </div>

      <section className="donationPanelStoreCard">
        <PanelImage className="donationPanelCover" src={coverUrl} alt={data.title} />
        <div className="donationPanelStoreText">
          <span>ที่อยู่</span>
          <p>{data.address || 'ตำแหน่งบนแผนที่'}</p>
          {Number.isFinite(distance) && <small>ห่างจากคุณ {distance.toFixed(1)} กม.</small>}
        </div>
      </section>

      <h2 className="donationPanelTitle">{data.title}</h2>

      <div className="donationPanelBody">
        <div className="donationPanelTags" aria-label="ประเภทที่รับบริจาค">
          <span className={`donationPanelTag donationPanelTag--${tone}`}>
            <span aria-hidden="true">{icon}</span>
            {data.category}
          </span>
        </div>

        <section className="donationPanelDetails">
          <h3>รายละเอียด</h3>
          <ul>
            {descriptionLines.length
              ? descriptionLines.map((line, index) => <li key={index}>{line}</li>)
              : <li className="isMuted">ไม่มีรายละเอียดเพิ่มเติม</li>}
            <li>จำนวน {data.quantity} ชิ้น</li>
            <li>เปิดรับ {formatBangkokDate(data.startDate)} – {formatBangkokDate(data.endDate)}</li>
            {data.status && <li>สถานะ: {STATUS_LABELS[data.status] || data.status}</li>}
            {data.owner?.name && <li>ผู้บริจาค: {data.owner.name}</li>}
          </ul>
        </section>

        {(galleryImages.length > 0 || loading || error) && (
          <section className={`donationPanelGallery${galleryImages.length ? '' : ' isTextOnly'}`} aria-label="รูปภาพของบริจาค">
            <div className="donationPanelGalleryHead">
              {galleryImages.length > 0 && <h3>รูปภาพ<br />ของบริจาค</h3>}
              {loading && <p className="donationPanelNote" role="status">กำลังโหลดรูปภาพทั้งหมด...</p>}
              {error && <p className="donationPanelNote isError" role="status">{error}</p>}
            </div>
            {galleryImages.length > 0 && (
              <div className="donationPanelGalleryRow">
                {galleryImages.map((image) => (
                  <PanelImage key={image.id} className="donationPanelGalleryImage" src={assetUrl(image.imageUrl)} alt={data.title} />
                ))}
              </div>
            )}
          </section>
        )}

        {detailHref && (
          <Link className="donationPanelAction" href={detailHref}>ดูรายละเอียด <span aria-hidden="true">→</span></Link>
        )}
      </div>
    </aside>
  );
}
