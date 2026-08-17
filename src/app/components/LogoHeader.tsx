import { Logo } from './Logo'

type LogoHeaderProps = {
  variant?: 'fixed' | 'inline'
}

export function LogoHeader({ variant = 'fixed' }: LogoHeaderProps) {
  const isFixed = variant === 'fixed'

  return (
    <header className={isFixed ? 'fixed top-0 left-0 z-[60] p-5 md:p-6' : 'inline-block'}>
      <a href="/" aria-label="Mr Sqoop Express home" className="inline-block">
        <Logo className={isFixed ? 'h-14 md:h-16' : 'h-12 md:h-14'} />
      </a>
    </header>
  )
}
