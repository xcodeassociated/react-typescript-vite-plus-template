import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function Home() {
  const { t } = useTranslation('main')

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>{t('home.title')}</CardTitle>
        <CardDescription>{t('home.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>{t('home.details')}</CardContent>
      <CardFooter className="text-sm text-muted-foreground">{t('home.contact')}</CardFooter>
    </Card>
  )
}

export default Home
