import {
  AirplaneTiltIcon,
  ArrowsLeftRightIcon,
  BankIcon,
  BookOpenIcon,
  CarIcon,
  ForkKnifeIcon,
  GameControllerIcon,
  HeartIcon,
  HouseIcon,
  LightningIcon,
  PiggyBankIcon,
  QuestionIcon,
  ShoppingCartIcon,
  WalletIcon,
} from "@phosphor-icons/react"
import type { Icon } from "@phosphor-icons/react"

export const CATEGORY_ICON_MAP: Record<string, Icon> = {
  PiggyBank: PiggyBankIcon,
  Wallet: WalletIcon,
  ShoppingCart: ShoppingCartIcon,
  Car: CarIcon,
  House: HouseIcon,
  Bank: BankIcon,
  ForkKnife: ForkKnifeIcon,
  ArrowsLeftRight: ArrowsLeftRightIcon,
  Lightning: LightningIcon,
  Heart: HeartIcon,
  BookOpen: BookOpenIcon,
  AirplaneTilt: AirplaneTiltIcon,
  GameController: GameControllerIcon,
  Question: QuestionIcon,
}

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICON_MAP)

export const getCategoryIcon = (iconKey: string): Icon =>
  CATEGORY_ICON_MAP[iconKey] ?? QuestionIcon
