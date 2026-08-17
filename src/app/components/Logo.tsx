import logo from '../../logo/image.png'

type LogoProps = {
  className?: string
}

export function Logo({ className = 'h-24 md:h-32' }: LogoProps) {
  return (
    <img
      src={logo}
      alt="Mr Sqoop Express"
      className={`${className} w-auto select-none rounded-2xl`}
      draggable={false}
    />
  )
}
