import { ScrollView } from "react-native";
import { Header } from "@/components/Header";
import { PhotoGrid } from "@/components/PhotoGrid";
import { Screen } from "@/components/ui";

export default function Photos() {
  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Your photos" sub="Your first photo is the one people see first." />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}><PhotoGrid /></ScrollView>
    </Screen>
  );
}
