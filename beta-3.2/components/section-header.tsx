export function SectionHeader({ title }: { title: string }) {
  return (
    <header className="px-6 pt-7 md:px-7 md:pt-[30px]">
      <h1 className="section-title title-heavy font-display text-4xl leading-none tracking-[0.02em] text-white uppercase md:text-[50px]">
        {title}
      </h1>
    </header>
  )
}
