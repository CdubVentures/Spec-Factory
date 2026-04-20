import { useEffect, useState } from 'react';

interface AnimatedDotsProps {
  interval?: number;
}

export function AnimatedDots({ interval = 350 }: AnimatedDotsProps) {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => {
      setCount((prev) => (prev === 3 ? 1 : prev + 1));
    }, interval);
    return () => clearInterval(id);
  }, [interval]);
  return <span aria-hidden="true">{'.'.repeat(count)}</span>;
}
