import { ImageSourcePropType } from 'react-native';
import { MoonPhase } from '../../utils/lunar';

export const orbMoonImages: Record<MoonPhase, ImageSourcePropType> = {
  'new':               require('../../assets/images/orb-moon/new.webp'),
  'waxing-crescent':   require('../../assets/images/orb-moon/waxing-crescent.webp'),
  'first-quarter':     require('../../assets/images/orb-moon/first-quarter.webp'),
  'waxing-gibbous':    require('../../assets/images/orb-moon/waxing-gibbous.webp'),
  'full':              require('../../assets/images/orb-moon/full.webp'),
  'waning-gibbous':    require('../../assets/images/orb-moon/waning-gibbous.webp'),
  'last-quarter':      require('../../assets/images/orb-moon/last-quarter.webp'),
  'waning-crescent':   require('../../assets/images/orb-moon/waning-crescent.webp'),
};