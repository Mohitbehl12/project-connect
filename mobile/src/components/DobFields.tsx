import { useRef } from "react";
import { View, type TextInput } from "react-native";
import { Field } from "@/components/ui";
import { parseWholeDate, typePart, type DobPart } from "@shared/dobInput";

type Dob = { day: string; month: string; year: string };

/**
 * Day → Month → Year boxes. The cursor moves to the next box as soon as a part is complete ("4" or "04" → Month,
 * "11" → Year), goes back on Backspace in an empty box, and a whole pasted or autofilled date fills all three.
 */
export function DobFields({ value, onChange }: { value: Dob; onChange: (v: Dob) => void }) {
  const refs = { day: useRef<TextInput>(null), month: useRef<TextInput>(null), year: useRef<TextInput>(null) };
  const next: Record<DobPart, DobPart | null> = { day: "month", month: "year", year: null };
  const prev: Record<DobPart, DobPart | null> = { day: null, month: "day", year: "month" };

  const change = (part: DobPart, raw: string) => {
    const whole = raw.length > 4 ? parseWholeDate(raw) : null;
    if (whole) { onChange(whole); refs.year.current?.focus(); return; }
    const { value: v, advance } = typePart(part, raw);
    onChange({ ...value, [part]: v });
    const to = next[part];
    if (advance && to) refs[to].current?.focus();
  };
  const back = (part: DobPart, key: string) => {
    const to = prev[part];
    if (key === "Backspace" && !value[part] && to) refs[to].current?.focus();
  };
  const box = (part: DobPart, label: string, placeholder: string, flex: number) => (
    <View style={{ flex }}>
      <Field inputRef={refs[part]} label={label} placeholder={placeholder} value={value[part]} keyboardType="number-pad"
        maxLength={part === "year" ? 4 : 10} returnKeyType={part === "year" ? "done" : "next"} selectTextOnFocus
        textContentType={part === "day" ? "birthdateDay" : part === "month" ? "birthdateMonth" : "birthdateYear"}
        onChangeText={(t) => change(part, t)} onKeyPress={(e) => back(part, e.nativeEvent.key)}
        onSubmitEditing={() => { const to = next[part]; if (to) refs[to].current?.focus(); }} blurOnSubmit={part === "year"} />
    </View>
  );
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {box("day", "Day", "DD", 1)}
      {box("month", "Month", "MM", 1)}
      {box("year", "Year", "YYYY", 1.4)}
    </View>
  );
}
