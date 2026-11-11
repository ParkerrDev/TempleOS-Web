import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import HemuNative
ApplicationWindow {
  visible: true
  width: 800; height: 700; minimumWidth: 640; minimumHeight: 570
  title: qsTr("TempleOS — HEMU")
  color: "#111111"
  id: window
  property bool confirmedClose: false
  onClosing: event=>{if(backend.ready&&!confirmedClose){event.accepted=false;closeDialog.open()}}
  Dialog {
    id: closeDialog; anchors.centerIn: parent; modal: true
    title: qsTr("Close TempleOS?"); standardButtons: Dialog.Ok|Dialog.Cancel
    Label { text: qsTr("Changes since your last save will be lost.") }
    onAccepted: {window.confirmedClose=true;window.close()}
  }
  Dialog {
    id: replaceDialog; anchors.centerIn: parent; modal: true
    property string nextPath
    title: qsTr("Replace the current session?"); standardButtons: Dialog.Ok|Dialog.Cancel
    Label { text: qsTr("Changes since your last save will be lost.") }
    onAccepted: backend.open(nextPath)
  }
  function openSession(nextPath) {
    if(backend.ready){replaceDialog.nextPath=nextPath;replaceDialog.open()}
    else backend.open(nextPath)
  }
  ColumnLayout {
    anchors.fill: parent; spacing: 6
    Item {
      Layout.fillWidth: true; Layout.fillHeight: true
    HemuScreen {
      anchors.centerIn: parent; width: Math.min(parent.width,parent.height*4/3); height: width*3/4
      id: screen; objectName: "screen"; focus: true
      image: backend.image
      onActiveFocusChanged: if(!activeFocus)backend.release()
      MouseArea {
        anchors.fill: parent; hoverEnabled: true; acceptedButtons: Qt.LeftButton|Qt.RightButton
        property int wheelCount: 0
        function point(mouse) { backend.mouse(mouse.x/width*640,mouse.y/height*480,mouse.buttons,wheelCount) }
        onPressed: mouse=>{ screen.forceActiveFocus(); point(mouse); backend.capture() }
        onReleased: mouse=>point(mouse)
        onPositionChanged: mouse=>point(mouse)
        onCanceled: backend.release()
        onWheel: wheel=>{ wheelCount+=Math.sign(wheel.angleDelta.y); backend.mouse(wheel.x/width*640,wheel.y/height*480,wheel.buttons,wheelCount) }
      }
    }
    }
    RowLayout {
      Layout.fillWidth: true
      TextField { id: path; Layout.fillWidth: true; placeholderText: qsTr("Complete .hemu session path"); text: backend.path }
      Button { text: qsTr("Open"); enabled: !backend.busy; onClicked: window.openSession(path.text) }
      Button { text: qsTr("Save"); enabled: backend.ready&&!backend.busy; onClicked: backend.save(path.text) }
    }
    RowLayout {
      Button { text: backend.paused?qsTr("Resume"):qsTr("Pause"); enabled: backend.ready&&!backend.busy&&!backend.faulted; onClicked: {backend.pause();screen.forceActiveFocus()} }
      Button { text: qsTr("Restart"); enabled: backend.ready&&!backend.busy; onClicked: window.openSession(backend.path) }
      Button { text: qsTr("Cancel"); enabled: backend.busy; onClicked: backend.cancel() }
      Label { text: backend.captured?qsTr("Pointer captured — Ctrl+Alt releases it"):backend.status; color: "white"; wrapMode: Text.Wrap; Layout.fillWidth: true }
    }
  }
}
