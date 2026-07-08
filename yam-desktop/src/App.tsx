import { useEffect, useState } from 'react';
import { fetchSchools, School } from './lib/db';

export default function App() {
  const [schools, setSchools] = useState<School[]>([]);

  useEffect(() => {
    fetchSchools('085410').then(setSchools);
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">共 {schools.length} 所院校</h1>
      <div className="space-y-2">
        {schools.slice(0, 5).map((s) => (
          <div key={s.school_id} className="p-2 border rounded">
            {s.name} - {s.province}
          </div>
        ))}
      </div>
    </div>
  );
}
