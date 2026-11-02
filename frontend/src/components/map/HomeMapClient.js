'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import CategoryFilter from './CategoryFilter';
import DonationInfoPanel from './DonationInfoPanel';
import RadiusFilter from './RadiusFilter';
import { api } from '../../lib/api';

const DonationMap = dynamic(() => import('./DonationMap'), { ssr: false });
const DEFAULT_RADIUS_KM = 5;
const SEARCH_DEBOUNCE_MS = 300;
const LOW_ACCURACY_METERS = 60;

export default function HomeMapClient({
  initialCategory = '',
  initialRadiusKm = DEFAULT_RADIUS_KM,
  clearReturnQuery = false,
}) {
  const [userPosition, setUserPosition] = useState(null);
  const [userAccuracy, setUserAccuracy] = useState(null);
  const [donations, setDonations] = useState([]);
  const [radiusKm, setRadiusKm] = useState(initialRadiusKm);
  const [category, setCategory] = useState(initialCategory);
  const [locating, setLocating] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDonation, setSelectedDonation] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState({ id: null, donation: null, error: '' });

  // A popup closing only clears the panel when it belongs to the current selection,
  // so switching markers does not blank the panel if the old popup closes late.
  const handleSelect = useCallback((donation, closedId) => {
    setSelectedDonation((current) => {
      if (donation) return donation;
      return current?.id === closedId ? null : current;
    });
  }, []);

  const selectedId = selectedDonation?.id ?? null;

  useEffect(() => {
    if (!selectedId) return undefined;

    let active = true;
    api(`/api/donations/${selectedId}`)
      .then((result) => {
        if (active) setSelectedDetail({ id: selectedId, donation: result, error: '' });
      })
      .catch((requestError) => {
        if (active) setSelectedDetail({ id: selectedId, donation: null, error: requestError.message || 'โหลดรายละเอียดไม่สำเร็จ' });
      });
    return () => { active = false; };
  }, [selectedId]);

  useEffect(() => {
    if (clearReturnQuery) {
      window.history.replaceState(window.history.state, '', '/');
    }
  }, [clearReturnQuery]);

  const locate = useCallback(({ fresh = false } = {}) => {
    if (!navigator.geolocation) {
      setLocating(false);
      setError('Browser นี้ไม่รองรับการอ่านตำแหน่ง');
      return;
    }

    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserPosition([coords.latitude, coords.longitude]);
        setUserAccuracy(Number.isFinite(Number(coords.accuracy)) ? Math.max(0, Math.round(coords.accuracy)) : null);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError('ไม่สามารถอ่านตำแหน่งได้ กรุณาอนุญาต Location แล้วลองอีกครั้ง');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: fresh ? 0 : 5000,
      },
    );
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => locate({ fresh: false }), 0);
    return () => clearTimeout(timer);
  }, [locate]);

  useEffect(() => {
    if (!userPosition) return undefined;

    const timer = setTimeout(async () => {
      const query = new URLSearchParams({
        lat: String(userPosition[0]),
        lng: String(userPosition[1]),
        radius: String(radiusKm),
      });
      if (category.trim()) query.set('category', category.trim());

      setLoading(true);
      setError('');
      try {
        setDonations(await api(`/api/donations/nearby?${query}`));
      } catch (requestError) {
        setDonations([]);
        setError(requestError.message || 'โหลดจุดบริจาคไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [userPosition, radiusKm, category]);

  const returnParams = new URLSearchParams();
  if (category.trim()) returnParams.set('category', category.trim());
  if (radiusKm !== DEFAULT_RADIUS_KM) returnParams.set('radius', String(radiusKm));
  const returnQuery = returnParams.toString();
  const mapReturnTo = returnQuery ? `/?${returnQuery}` : '/';
  const lowAccuracy = userAccuracy != null && userAccuracy > LOW_ACCURACY_METERS;
  const detailMatches = selectedDetail.id === selectedId;
  const selectedDetailHref = selectedId && (mapReturnTo === '/'
    ? `/donations/${selectedId}`
    : `/donations/${selectedId}?returnTo=${encodeURIComponent(mapReturnTo)}`);

  return (
    <main className="mapShell">
      <DonationMap
        donations={donations}
        userPosition={userPosition}
        userAccuracy={userAccuracy}
        radiusKm={radiusKm}
        returnTo={mapReturnTo}
        onSelect={handleSelect}
      />

      <div className="mapSummary" aria-live="polite">
        <span className="mapSummaryDot" aria-hidden="true" />
        <strong>{donations.length}</strong>
        <span>{userPosition ? 'จุดในรัศมี' : 'จุดบริจาค'}</span>
      </div>

      {lowAccuracy && !error && (
        <div className="mapAccuracyNotice" role="status">
          GPS ±{userAccuracy} ม. · ตำแหน่งอาจคลาดเคลื่อน กดตำแหน่งฉันเพื่อลองใหม่
        </div>
      )}

      {(loading || error) && (
        <div className={`mapStatus${error ? ' mapStatusError' : ''}`} role="status">
          {error || 'กำลังอัปเดตจุดบริจาค...'}
        </div>
      )}

      <button
        className="mapFloatButton mapLocateButton"
        type="button"
        onClick={() => locate({ fresh: true })}
        aria-label="ตำแหน่งฉัน"
        disabled={locating}
      >
        {locating ? <span className="mapLocateSpinner" aria-hidden="true" /> : <span className="mapLocateGlyph" aria-hidden="true" />}
      </button>

      <CategoryFilter value={category} onChange={setCategory} disabled={!userPosition} />
      <RadiusFilter value={radiusKm} onChange={setRadiusKm} disabled={!userPosition} locating={locating} />

      {selectedDonation && (
        <DonationInfoPanel
          key={selectedDonation.id}
          donation={selectedDonation}
          detail={detailMatches ? selectedDetail.donation : null}
          loading={!detailMatches}
          error={detailMatches ? selectedDetail.error : ''}
          detailHref={selectedDetailHref}
          onClose={() => setSelectedDonation(null)}
        />
      )}
    </main>
  );
}
