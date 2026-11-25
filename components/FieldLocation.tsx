'use client';

import {useEffect, useRef, useState} from 'react';
import {LocateFixed} from 'lucide-react';

export function FieldLocation() {
  const [location, setLocation] = useState<GeolocationCoordinates | null>(null);
  const [status, setStatus] = useState('');
  const [locating, setLocating] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const request = useRef(0);

  useEffect(() => {
    const form = container.current?.closest('form');
    const clear = () => {
      request.current += 1;
      setLocation(null);
      setStatus('');
      setLocating(false);
    };
    form?.addEventListener('reset', clear);
    return () => {
      request.current += 1;
      form?.removeEventListener('reset', clear);
    };
  }, []);

  function capture() {
    if (!navigator.geolocation) {
      setStatus('Location is unavailable on this device.');
      return;
    }
    setLocating(true);
    setStatus('Getting your location…');
    const token = ++request.current;
    navigator.geolocation.getCurrentPosition(({coords}) => {
      if (request.current !== token) return;
      setLocation(coords);
      setStatus('Location attached to this activity.');
      setLocating(false);
    }, () => {
      if (request.current !== token) return;
      setStatus('Location unavailable. You can still save.');
      setLocating(false);
    }, {enableHighAccuracy: true, timeout: 8000, maximumAge: 0});
  }

  return <div className="field span-2" ref={container}>
    <div className="actions">
      <button className="btn" type="button" onClick={capture} disabled={locating || Boolean(location)}>
        <LocateFixed size={16} aria-hidden="true"/> Attach location
      </button>
      {location && <button type="button" className="btn" onClick={() => {setLocation(null);setStatus('Location removed.');}}>Remove</button>}
    </div>
    <p className="card-sub" role="status">{status || 'Optional. The device may ask for permission.'}</p>
    <input type="hidden" name="latitude" value={location?.latitude ?? ''}/>
    <input type="hidden" name="longitude" value={location?.longitude ?? ''}/>
    <input type="hidden" name="accuracy" value={location?.accuracy ?? ''}/>
  </div>;
}
