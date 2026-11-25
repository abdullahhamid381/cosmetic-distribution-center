'use client';

import {useEffect, useState} from 'react';
import {
  ArrowLeft, ArrowRight, Boxes, ClipboardList, FileText, PackageCheck, Pause, Play,
  ReceiptText, Store, Truck, Wallet,
} from 'lucide-react';
import styles from './sign-in.module.css';

const staffSlides = [
  {
    label: 'Inventory',
    title: 'Know what’s in stock.',
    description: 'Track stock by warehouse and batch, from receiving to dispatch.',
    steps: [{icon: PackageCheck, label: 'Stock receipts'}, {icon: Boxes, label: 'Warehouse inventory'}, {icon: Truck, label: 'Dispatch'}],
  },
  {
    label: 'Distribution',
    title: 'Follow every order.',
    description: 'See shop orders, deliveries, and invoices in one workspace.',
    steps: [{icon: Store, label: 'Shop orders'}, {icon: Truck, label: 'Deliveries'}, {icon: FileText, label: 'Invoices'}],
  },
  {
    label: 'Finance',
    title: 'See what’s been paid.',
    description: 'Record payments, review shop balances, and export reports.',
    steps: [{icon: ReceiptText, label: 'Payment receipts'}, {icon: Wallet, label: 'Outstanding balances'}, {icon: FileText, label: 'Reports'}],
  },
];

const agentSlides = [
  {
    label: 'Sales',
    title: 'Enter customer orders.',
    description: 'Choose products and quantities and submit orders from your phone or desktop.',
    steps: [{icon: Store, label: 'Customer details'}, {icon: Boxes, label: 'Products and quantities'}, {icon: ClipboardList, label: 'Order submission'}],
  },
  {
    label: 'Deliveries',
    title: 'Keep customers updated.',
    description: 'Check the status of submitted orders and see when they’re dispatched or delivered.',
    steps: [{icon: ClipboardList, label: 'Submitted orders'}, {icon: Truck, label: 'Dispatch'}, {icon: PackageCheck, label: 'Delivery status'}],
  },
  {
    label: 'Commissions',
    title: 'Track your earnings.',
    description: 'Review commission activity and keep your customer advance payments on record.',
    steps: [{icon: ReceiptText, label: 'Advance payments'}, {icon: Wallet, label: 'Commissions'}, {icon: FileText, label: 'Account activity'}],
  },
];

export function SignInCarousel({agent}: {agent: boolean}) {
  const slides = agent ? agentSlides : staffSlides;
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMotionAllowed(!media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!motionAllowed || !playing || hovered || focused) return;
    const timeout = window.setTimeout(() => setActive(index => (index + 1) % slides.length), 6500);
    return () => window.clearTimeout(timeout);
  }, [active, focused, hovered, motionAllowed, playing, slides.length]);

  function move(direction: number) {
    setActive(index => (index + direction + slides.length) % slides.length);
  }

  return (
    <section className={styles.carousel} aria-roledescription="carousel" aria-label="Workspace features"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}>
      <div className={styles.slides} aria-live={playing && motionAllowed && !focused && !hovered ? 'off' : 'polite'}>
        {slides.map(({label, title, description, steps}, index) => (
          <article className={styles.slide} key={label} data-active={index === active}
            aria-hidden={index !== active} aria-roledescription="slide" aria-label={label}>
            <div className={styles.slideCopy}>
              <p className={styles.slideLabel}>{label}</p>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            <div className={styles.workflow}>
              {steps.map(({icon: Icon, label: step}) => (
                <div className={styles.workflowStep} key={step}>
                  <span><Icon size={19} aria-hidden="true"/></span>
                  <strong>{step}</strong>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
      <div className={styles.carouselControls}>
        <div className={styles.indicators} aria-label="Choose a slide">
          {slides.map(({label}, index) => <button className={styles.indicator} type="button" key={label}
            aria-label={label} aria-pressed={active === index} onClick={() => setActive(index)}/>)}
        </div>
        <div className={styles.carouselButtons}>
          {motionAllowed && <button type="button" onClick={() => setPlaying(value => !value)}
            aria-label={playing ? 'Pause slideshow' : 'Play slideshow'}>
            {playing ? <Pause size={16} aria-hidden="true"/> : <Play size={16} aria-hidden="true"/>}
          </button>}
          <button type="button" aria-label="Previous slide" onClick={() => move(-1)}><ArrowLeft size={18} aria-hidden="true"/></button>
          <button type="button" aria-label="Next slide" onClick={() => move(1)}><ArrowRight size={18} aria-hidden="true"/></button>
        </div>
      </div>
    </section>
  );
}
