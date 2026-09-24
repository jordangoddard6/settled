import type { Participant } from "../../shared/types";

export function People({ participants, online, you }: { participants: Participant[]; online: string[]; you: string | null }) {
  const onlineSet = new Set(online);
  return (
    <ul className="flex flex-wrap gap-2" aria-label="People in this order">
      {participants.map((p) => {
        const isOnline = onlineSet.has(p.id);
        return (
          <li
            key={p.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-white py-1 pr-3 pl-1 text-sm ring-1 ring-stone-200"
            title={isOnline ? "Online" : "Offline"}
          >
            <span className="relative grid h-6 w-6 place-items-center rounded-full bg-stone-200 text-xs font-bold text-stone-700">
              {p.name.charAt(0).toUpperCase()}
              <span
                className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${isOnline ? "bg-emerald-500" : "bg-stone-300"}`}
              />
            </span>
            <span className="font-medium">{p.name}</span>
            {p.isHost && <span className="text-xs text-stone-500">host</span>}
            {p.id === you && <span className="text-xs text-stone-500">(you)</span>}
          </li>
        );
      })}
    </ul>
  );
}
