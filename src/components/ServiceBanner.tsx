import React, { useState, useEffect } from 'react';
import { AlertTriangle, HardDrive } from 'lucide-react';

const messages = [
  { text: 'Servizio non disponibile', icon: AlertTriangle },
  { text: 'Solo RealDebrid', icon: HardDrive },
];

const ServiceBanner: React.FC = () => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex(prev => (prev + 1) % messages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const current = messages[index];
  const Icon = current.icon;

  return (
    <div className="bg-orange-500 text-white px-4 py-2.5 flex items-center justify-center gap-2 z-50 transition-all">
      <Icon className="w-4 h-4 shrink-0" />
      <span className="text-sm font-medium">{current.text}</span>
    </div>
  );
};

export default ServiceBanner;
