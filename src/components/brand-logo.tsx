import Image from "next/image";

export function BrandLogo({ slug, size = 42 }: { slug: string; size?: number }) {
  return (
    <Image
      className="atlas-brand-image"
      src={"/brands/" + slug + ".svg"}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      unoptimized
    />
  );
}
