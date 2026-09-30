import Image from "next/image";

export function TeamLogo({ src, abbr, size = 32 }: { src: string | null; abbr: string; size?: number }) {
  if (!src) {
    return (
      <span
        style={{ width: size, height: size }}
        className="display grid shrink-0 place-items-center rounded-full bg-raised text-[10px] font-bold text-muted"
      >
        {abbr}
      </span>
    );
  }
  return <Image src={src} alt="" width={size} height={size} className="shrink-0 object-contain" unoptimized />;
}
