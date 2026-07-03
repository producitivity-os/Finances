type Props = {
  name: string
  email: string
  avatar?: string
}

export function ProfilePage({ name, email, avatar }: Props) {
  return (
    <div className="w-full pb-20 pt-4 md:mx-auto md:max-w-5xl md:px-1 md:pt-6">
      <div className="grid gap-4 px-1.5 md:px-0">
        <div className="border-y bg-card p-4 md:border">
          <h1 className="text-lg font-semibold tracking-tight">Profile</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            View your account profile.
          </p>
        </div>

        <div className="border-y bg-card p-4 md:border">
          <div className="flex items-center gap-4">
            {avatar ? (
              <img
                src={avatar}
                alt={name}
                className="size-16 border object-cover"
              />
            ) : (
              <div className="flex size-16 items-center justify-center border bg-muted text-lg font-semibold">
                {name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">{name}</h2>
              <p className="mt-1 truncate text-xs text-muted-foreground">{email}</p>
            </div>
          </div>
          <dl className="mt-4 grid gap-2 border-t pt-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Display name</dt>
              <dd className="font-medium">{name}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{email}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
